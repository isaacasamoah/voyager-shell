// Finding Clustering for Deep Retrieval
// Two-stage compression: metadata pre-grouping + LLM refinement
//
// Goal: Transform 200 raw findings into 5 themed clusters
// with progressive disclosure (nothing lost, better organized)

import { callGemini } from '@/lib/gemini/client'
import { CLUSTERING_PROMPT } from './primitives'
import type { FindingCluster, ClusteredResult } from './deep-retrieval'
import type { RetrievalResult } from './executor'
import { log } from '@/lib/debug'

// =============================================================================
// Types
// =============================================================================

type Finding = RetrievalResult['findings'][0]

interface ClusteringOptions {
  maxClusters?: number          // Default: 5
  maxFindingsPerCluster?: number // Default: 10
  minClusterSize?: number       // Default: 2
}

interface GeminiClusterResponse {
  clusters: Array<{
    theme: string
    summary: string
    findingIds: string[]
  }>
  unclustered: string[]
}

// =============================================================================
// Pre-Grouping (No LLM - Fast)
// =============================================================================

interface PreGroup {
  key: string
  findings: Finding[]
  source: 'topic' | 'classification' | 'temporal'
}

/**
 * Pre-group findings by existing metadata.
 * This reduces LLM input size and provides scaffolding.
 */
function preGroupFindings(findings: Finding[]): PreGroup[] {
  const groups: Map<string, PreGroup> = new Map()

  for (const finding of findings) {
    // We don't have topics/classification on raw findings from executor
    // But we can group by similarity bands if available
    let key: string
    let source: 'topic' | 'classification' | 'temporal'

    if (finding.similarity !== undefined) {
      // Group by similarity band
      const band = Math.floor(finding.similarity * 10) / 10
      key = `similarity_${band.toFixed(1)}`
      source = 'classification'
    } else {
      // Fallback: all go to one group
      key = 'all'
      source = 'topic'
    }

    if (!groups.has(key)) {
      groups.set(key, { key, findings: [], source })
    }
    groups.get(key)!.findings.push(finding)
  }

  return Array.from(groups.values())
}

// =============================================================================
// LLM Clustering (Gemini Flash)
// =============================================================================

/**
 * Use Gemini Flash to assign themes and group findings.
 * Input: pre-grouped findings (max 50 for cost/latency)
 * Output: cluster assignments using simple numeric indices
 */
async function llmCluster(
  findings: Finding[],
  originalQuery: string,
  options: Required<ClusteringOptions>
): Promise<GeminiClusterResponse> {
  // Use simple numeric indices for clarity - LLM returns these same indices
  const maxToCluster = Math.min(findings.length, 50)
  const findingsForLLM = findings.slice(0, maxToCluster)

  const userPrompt = `Query: "${originalQuery}"

Findings to cluster (${maxToCluster}):
${findingsForLLM.map((f, i) => `${i}: ${f.content.slice(0, 200)}${f.isPinned ? ' (PINNED)' : ''}`).join('\n')}

Max clusters: ${options.maxClusters}
Max findings per cluster: ${options.maxFindingsPerCluster}
Min cluster size: ${options.minClusterSize}

Return JSON with clusters. Use the numeric indices (0, 1, 2...) as findingIds.`

  try {
    const response = await callGemini({
      systemPrompt: CLUSTERING_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 1000,
    })

    // Parse JSON from response
    const text = response.text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      log.agent('No JSON in clustering response, falling back', undefined, 'warn')
      // Fallback: single cluster with all findings (use indices)
      return {
        clusters: [{
          theme: 'Search Results',
          summary: `Found ${maxToCluster} relevant items`,
          findingIds: Array.from({ length: maxToCluster }, (_, i) => String(i)),
        }],
        unclustered: [],
      }
    }

    const parsed = JSON.parse(jsonMatch[0]) as GeminiClusterResponse
    log.agent(`LLM clustered into ${parsed.clusters.length} themes`, {
      clusterSizes: parsed.clusters.map(c => c.findingIds.length),
      unclustered: parsed.unclustered.length,
    })
    return parsed
  } catch (error) {
    log.agent('LLM clustering failed', { error: String(error) }, 'error')
    // Fallback: single cluster with all findings (use indices)
    return {
      clusters: [{
        theme: 'Search Results',
        summary: `Found ${maxToCluster} relevant items`,
        findingIds: Array.from({ length: maxToCluster }, (_, i) => String(i)),
      }],
      unclustered: [],
    }
  }
}

// =============================================================================
// Post-Processing
// =============================================================================

/**
 * Build final cluster structure from LLM response.
 * - Create FindingCluster objects with full finding data
 * - Merge clusters below minClusterSize into unclustered
 * - Select representative finding per cluster
 */
function buildClusters(
  findings: Finding[],
  llmResult: GeminiClusterResponse,
  options: Required<ClusteringOptions>
): ClusteredResult {
  // Create lookup for findings by numeric index (as string)
  // LLM returns indices like "0", "1", "2" - we match using same convention
  const findingMap = new Map<string, Finding>()
  findings.forEach((f, idx) => {
    // Use string index as key - must match what LLM returns
    findingMap.set(String(idx), f)
  })

  const clusters: FindingCluster[] = []
  const unclustered: Finding[] = []

  // Process each cluster from LLM
  for (const llmCluster of llmResult.clusters) {
    const clusterFindings: Finding[] = []

    for (const id of llmCluster.findingIds) {
      const finding = findingMap.get(id)
      if (finding) {
        clusterFindings.push(finding)
        findingMap.delete(id) // Mark as used
      }
    }

    // Check minimum size
    if (clusterFindings.length < options.minClusterSize) {
      unclustered.push(...clusterFindings)
      continue
    }

    // Limit findings per cluster
    const limitedFindings = clusterFindings.slice(0, options.maxFindingsPerCluster)

    // Select representative: highest similarity, or pinned, or first
    let representative = limitedFindings[0]
    for (const f of limitedFindings) {
      if (f.isPinned) {
        representative = f
        break
      }
      if ((f.similarity ?? 0) > (representative.similarity ?? 0)) {
        representative = f
      }
    }

    clusters.push({
      id: crypto.randomUUID(),
      theme: llmCluster.theme,
      summary: llmCluster.summary,
      confidence: calculateClusterConfidence(limitedFindings),
      findings: limitedFindings,
      representativeId: representative.eventId,
    })
  }

  // Add explicitly unclustered from LLM
  for (const id of llmResult.unclustered) {
    const finding = findingMap.get(id)
    if (finding) {
      unclustered.push(finding)
      findingMap.delete(id)
    }
  }

  // Add any remaining findings (not claimed by any cluster)
  unclustered.push(...Array.from(findingMap.values()))

  // Sort clusters by average similarity (best first)
  clusters.sort((a, b) => b.confidence - a.confidence)

  // Limit to max clusters
  if (clusters.length > options.maxClusters) {
    const overflow = clusters.splice(options.maxClusters)
    for (const c of overflow) {
      unclustered.push(...c.findings)
    }
  }

  return {
    clusters,
    unclustered: unclustered.slice(0, 20), // Cap unclustered too
    totalFindings: findings.length,
    clusteringMethod: 'hybrid',
  }
}

/**
 * Calculate cluster coherence based on similarity scores.
 */
function calculateClusterConfidence(findings: Finding[]): number {
  const withSimilarity = findings.filter(f => f.similarity !== undefined)
  if (withSimilarity.length === 0) return 0.5

  const avgSimilarity = withSimilarity.reduce((sum, f) => sum + (f.similarity ?? 0), 0) / withSimilarity.length
  return Math.round(avgSimilarity * 100) / 100
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Cluster findings for progressive disclosure.
 *
 * Pipeline:
 * 1. Pre-group by metadata (no LLM)
 * 2. LLM refines groups into themes (Gemini Flash)
 * 3. Post-process: merge small, cap sizes
 */
export async function clusterFindings(
  findings: Finding[],
  originalQuery: string,
  options?: ClusteringOptions
): Promise<ClusteredResult> {
  const opts: Required<ClusteringOptions> = {
    maxClusters: options?.maxClusters ?? 5,
    maxFindingsPerCluster: options?.maxFindingsPerCluster ?? 10,
    minClusterSize: options?.minClusterSize ?? 2,
  }

  log.agent(`Clustering ${findings.length} findings`)

  // Small result set: single cluster, no LLM
  if (findings.length < 10) {
    log.agent('Small result set, skipping LLM clustering')
    return {
      clusters: findings.length > 0 ? [{
        id: crypto.randomUUID(),
        theme: 'Results',
        summary: `Found ${findings.length} relevant item${findings.length === 1 ? '' : 's'}`,
        confidence: calculateClusterConfidence(findings),
        findings: findings.slice(0, opts.maxFindingsPerCluster),
        representativeId: findings[0]?.eventId ?? '',
      }] : [],
      unclustered: [],
      totalFindings: findings.length,
      clusteringMethod: 'topic',
    }
  }

  // Pre-group for scaffolding (currently light - could enhance with topics later)
  const preGroups = preGroupFindings(findings)
  log.agent(`Pre-grouped into ${preGroups.length} groups`)

  // LLM clustering
  const llmResult = await llmCluster(findings, originalQuery, opts)

  // Build final structure
  const result = buildClusters(findings, llmResult, opts)

  log.agent(`Clustered ${findings.length} findings into ${result.clusters.length} clusters + ${result.unclustered.length} unclustered`)

  return result
}
