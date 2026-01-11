import { AstronautState } from '@/components/chat/AstronautState';

export const dynamic = 'force-dynamic'

const states = ['success', 'searching', 'idle', 'error', 'listening', 'celebrating'] as const;

export default function AstronautPreviewPage() {
  return (
    <div className="min-h-screen bg-[#050505] p-8">
      <h1 className="text-2xl font-mono text-slate-300 mb-8">Voyager Astronaut States</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
        {states.map((state) => (
          <div key={state} className="flex flex-col items-center gap-4 p-8 rounded-lg border border-white/10 bg-white/5">
            <AstronautState state={state} size="lg" />
            <span className="text-slate-400 font-mono text-sm">{state}</span>
          </div>
        ))}
      </div>

      {/* Raw images */}
      <h2 className="text-xl font-mono text-slate-300 mt-12 mb-6">Raw Assets</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
        {states.map((state) => (
          <div key={state} className="flex flex-col items-center gap-4 p-8 rounded-lg border border-white/10 bg-white/5">
            <img
              src={`/images/astronaut/${state}.png`}
              alt={state}
              className="w-40 h-40 object-contain"
            />
            <span className="text-slate-400 font-mono text-sm">{state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
