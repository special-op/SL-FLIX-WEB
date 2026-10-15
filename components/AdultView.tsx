import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Code, Terminal, Cpu, Wrench, Sparkles, CheckCircle2, 
  ArrowLeft, GitBranch, FileCode, Laptop, Play, RotateCw, ShieldCheck, Flame
} from 'lucide-react';

interface AdultViewProps {
  onBack: () => void;
  onPlayStream?: (title: string, sources: Array<{ title: string; videoUrl: string; isM3u8?: boolean }>, posterUrl?: string) => void;
}

export const AdultView: React.FC<AdultViewProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'terminal'>('editor');
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState<boolean>(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState<number>(92);
  const [typedLineIndex, setTypedLineIndex] = useState<number>(0);

  // Simulated code lines for typing animation in editor
  const codeSnippet = [
    '// -------------------------------------------------------------',
    '// SLFLIX ADULT MODULE v2.4.0 [IN DEVELOPMENT]',
    '// Status: Upgrading Security & High-Bitrate HLS Stream Engine',
    '// -------------------------------------------------------------',
    '',
    "import { SecureStream, DRMProxy } from '@slflix/stream-core';",
    "import { AdultEngine } from '@slflix/adult-engine';",
    '',
    'interface LoungeConfig {',
    '  ageRestriction: 18;',
    '  pinProtection: true;',
    "  streamResolution: '4K_UHD_READY';",
    "  encryptionState: 'ACTIVE';",
    '}',
    '',
    'export async function bootAdultLoungeModule(): Promise<void> {',
    '  console.log("Re-indexing video cache and buffer pipelines...");',
    '  await DRMProxy.verifyTokens();',
    '  await AdultEngine.refactorPlayerUI();',
    '',
    '  // Developer is crafting a brand-new ultra fast experience!',
    '  return { status: "DEVELOPING", completion: 94.8 };',
    '}'
  ];

  // Typing effect tick
  useEffect(() => {
    const timer = setInterval(() => {
      setTypedLineIndex((prev) => (prev < codeSnippet.length ? prev + 1 : prev));
    }, 150);
    return () => clearInterval(timer);
  }, []);

  // Diagnostic execution simulation
  const runDiagnostic = () => {
    setIsRunningDiagnostic(true);
    setDiagnosticLogs(['[SYS] Starting Module Diagnostic Scan...']);
    
    const logs = [
      '[SYS] Checking stream proxy server endpoints... OK',
      '[SYS] Verifying DRM token handshake... OK',
      '[SYS] Testing HLS adaptive playlist parser... OK',
      '[SYS] Optimizing buffer chunks & caching... OK',
      '[SYS] Polishing Cyberpunk Developer UI... COMPLETED',
      '[STATUS] Module build ready for deployment soon!'
    ];

    logs.forEach((log, index) => {
      setTimeout(() => {
        setDiagnosticLogs((prev) => [...prev, log]);
        if (index === logs.length - 1) {
          setIsRunningDiagnostic(false);
          setProgress(98);
        }
      }, (index + 1) * 600);
    });
  };

  return (
    <div className="min-h-screen bg-[#07060b] text-white flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 pt-safe pb-24 relative overflow-hidden">
      {/* Background Animated Neon Mesh Grid */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(217,70,239,0.12),transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(56,189,248,0.08),transparent_60%)] pointer-events-none" />
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#d946ef 1px, transparent 1px), radial-gradient(#38bdf8 1px, #07060b 1px)`,
          backgroundSize: '32px 32px',
          backgroundPosition: '0 0, 16px 16px'
        }}
      />

      <div className="max-w-4xl w-full relative z-10 my-auto">
        {/* Top Header Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={onBack}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold text-gray-300 hover:text-white transition flex items-center gap-2 cursor-pointer backdrop-blur-md shadow-lg"
          >
            <ArrowLeft size={16} />
            Back to Home
          </button>

          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fuchsia-500"></span>
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 px-3 py-1 rounded-full">
              System In Development
            </span>
          </div>
        </div>

        {/* Main Dev Coding Card */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-[#0e0c15]/90 border border-fuchsia-500/30 rounded-3xl overflow-hidden shadow-[0_0_60px_rgba(217,70,239,0.15)] backdrop-blur-xl flex flex-col"
        >
          {/* Simulated VSCode / IDE Titlebar */}
          <div className="bg-[#14101f] border-b border-white/10 px-4 py-3 flex items-center justify-between select-none">
            {/* Window Controls */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-400/40" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 border border-yellow-400/40" />
              <div className="w-3 h-3 rounded-full bg-green-500/80 border border-green-400/40" />
              <span className="ml-3 text-[11px] font-mono text-gray-400 flex items-center gap-1.5 hidden sm:flex">
                <Laptop size={13} className="text-fuchsia-400" />
                slflix-workspace / modules / <strong className="text-white">adult_lounge.ts</strong>
              </span>
            </div>

            {/* Editor Tab Selectors */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setActiveTab('editor')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'editor'
                    ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/40'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <FileCode size={12} /> Source Code
              </button>
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'terminal'
                    ? 'bg-fuchsia-600 text-white shadow-md shadow-fuchsia-600/40'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Terminal size={12} /> Console
              </button>
            </div>
          </div>

          {/* IDE Content Area */}
          <div className="p-4 sm:p-6 min-h-[320px] max-h-[420px] overflow-y-auto font-mono text-xs leading-relaxed bg-[#0a0812] text-gray-300 relative">
            <AnimatePresence mode="wait">
              {activeTab === 'editor' ? (
                <motion.div
                  key="editor"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-1"
                >
                  {codeSnippet.slice(0, typedLineIndex).map((line, idx) => {
                    let colorClass = 'text-gray-300';
                    if (line.startsWith('//')) colorClass = 'text-gray-500 italic';
                    else if (line.startsWith('import')) colorClass = 'text-sky-400 font-semibold';
                    else if (line.startsWith('interface') || line.startsWith('export')) colorClass = 'text-fuchsia-400 font-bold';
                    else if (line.includes(':')) colorClass = 'text-emerald-300';
                    else if (line.includes('console.log')) colorClass = 'text-amber-300';

                    return (
                      <div key={idx} className="flex items-start gap-4 hover:bg-white/[0.02] px-2 py-0.5 rounded transition">
                        <span className="w-6 text-right text-gray-600 select-none text-[10px] pt-0.5 font-mono">
                          {idx + 1}
                        </span>
                        <span className={`flex-1 whitespace-pre-wrap ${colorClass}`}>
                          {line}
                        </span>
                      </div>
                    );
                  })}

                  {/* Animated Blinking Cursor */}
                  <div className="flex items-center gap-4 px-2 py-0.5">
                    <span className="w-6 text-right text-gray-600 select-none text-[10px] font-mono">
                      {typedLineIndex + 1}
                    </span>
                    <motion.span
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ repeat: Infinity, duration: 0.8 }}
                      className="w-2 h-4 bg-fuchsia-400 inline-block shadow-[0_0_8px_#d946ef]"
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="terminal"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2 text-emerald-400 font-mono"
                >
                  <div className="text-gray-500">$ slflix-cli module:build --target=adult-lounge</div>
                  <div className="text-sky-400">[INFO] Loading modules... Done (0.12s)</div>
                  <div className="text-amber-300">[BUILD] Compiling TypeScript AST to optimized bytecode...</div>
                  <div className="text-emerald-400">[SUCCESS] CSS Animations & Development layout mounted.</div>
                  
                  {diagnosticLogs.map((log, i) => (
                    <div key={i} className="text-xs text-fuchsia-300">
                      {log}
                    </div>
                  ))}

                  {isRunningDiagnostic && (
                    <div className="flex items-center gap-2 text-amber-400 mt-2">
                      <RotateCw size={14} className="animate-spin" />
                      <span>Executing system checks...</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Development Status Footer & Progress */}
          <div className="bg-[#120e1c] border-t border-white/10 p-5 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-5">
            {/* Status & Developer Icon */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-fuchsia-600 to-pink-600 p-[1px] shadow-lg shadow-fuchsia-600/30">
                  <div className="w-full h-full bg-[#120e1c] rounded-[15px] flex items-center justify-center text-fuchsia-400">
                    <Wrench className="w-6 h-6 animate-pulse" />
                  </div>
                </div>
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black italic tracking-wide text-white">
                    PAGE UNDER DEVELOPMENT
                  </h3>
                  <span className="px-2 py-0.5 bg-fuchsia-500/20 text-fuchsia-300 text-[10px] font-extrabold rounded-md border border-fuchsia-500/30">
                    v2.4 DEV
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Our team is refactoring and enhancing this section. Stay tuned for updates!
                </p>
              </div>
            </div>

            {/* Interactive Diagnostic Button & Progress */}
            <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-4">
              {/* Progress Bar */}
              <div className="w-full sm:w-44 bg-white/5 border border-white/10 rounded-2xl p-2.5">
                <div className="flex justify-between text-[10px] font-bold text-gray-300 mb-1">
                  <span>DEV PROGRESS</span>
                  <span className="text-fuchsia-400">{progress}%</span>
                </div>
                <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden p-0.5 border border-white/5">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1 }}
                    className="h-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-sky-400 rounded-full shadow-[0_0_10px_#d946ef]"
                  />
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={runDiagnostic}
                disabled={isRunningDiagnostic}
                className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-fuchsia-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isRunningDiagnostic ? (
                  <RotateCw size={15} className="animate-spin" />
                ) : (
                  <Cpu size={15} />
                )}
                <span>{isRunningDiagnostic ? 'Testing...' : 'Run Dev Scan'}</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Feature Badges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <div className="bg-[#100a18]/80 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Enhanced Security</h4>
              <p className="text-[11px] text-gray-400">PIN protection & age filter</p>
            </div>
          </div>

          <div className="bg-[#100a18]/80 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Flame size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">4K UHD Engine</h4>
              <p className="text-[11px] text-gray-400">Next-gen adaptive streaming</p>
            </div>
          </div>

          <div className="bg-[#100a18]/80 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white">Zero Ad-Break</h4>
              <p className="text-[11px] text-gray-400">Direct CDN proxy playback</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdultView;
