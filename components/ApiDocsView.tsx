import React from 'react';
const ApiDocsView: React.FC = () => {
    return (
        <div className="min-h-screen bg-[#0a0a15] text-white p-8 pt-24 animate-fade-in">
            <div className="max-w-4xl mx-auto bg-[#1a1a2e] border border-white/10 rounded-2xl p-8 shadow-2xl">
                <h1 className="text-3xl md:text-4xl font-extrabold mb-6 text-white flex items-center gap-3">
                    <i className="fa-solid fa-code text-primary"></i> SL-FLIX PRO - Secure RESTful API Documentation
                </h1>
                <section className="mb-10">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-gray-200">
                        <i className="fa-solid fa-lock text-green-500"></i> Security Overview
                    </h2>
                    <p className="text-gray-400 leading-relaxed">
                        This API provides a secure layer between the frontend and external movie services. All external API endpoints are hidden behind our secure proxy.
                    </p>
                </section>
                <section className="mb-10">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-gray-200">
                        <i className="fa-solid fa-rocket text-blue-500"></i> Base URL
                    </h2>
                    <div className="bg-black/50 p-4 rounded-lg border border-white/5 font-mono text-primary">
                        /api
                    </div>
                </section>
                <section className="mb-10">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-gray-200">
                        <i className="fa-solid fa-chart-bar text-purple-500"></i> Rate Limiting
                    </h2>
                    <ul className="list-disc list-inside text-gray-400 space-y-2">
                        <li><strong className="text-white">100 requests</strong> per <strong className="text-white">15 minutes</strong> per IP</li>
                        <li>Automatic cache management for optimal performance</li>
                        <li>5-minute response caching</li>
                    </ul>
                </section>
                <section className="mb-10">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 text-gray-200">
                        <i className="fa-solid fa-key text-yellow-500"></i> Authentication
                    </h2>
                    <p className="text-gray-400">No authentication required (public endpoints)</p>
                </section>
                <section className="mb-10">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-gray-200">
                        <i className="fa-solid fa-list text-pink-500"></i> Endpoints
                    </h2>
                    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                        <div className="bg-white/10 px-6 py-4 border-b border-white/10">
                            <h3 className="text-xl font-bold text-white">1. Search Movies & Series</h3>
                        </div>
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <span className="bg-blue-500/20 text-blue-400 font-bold px-3 py-1 rounded text-sm uppercase tracking-wider">GET</span>
                                <code className="text-gray-300 font-mono">/api/search?q={'{query}'}&page={'{page}'}</code>
                            </div>
                            <h4 className="font-bold text-white mb-3">Parameters:</h4>
                            <ul className="list-disc list-inside text-gray-400 space-y-2 mb-6">
                                <li><code className="text-primary bg-primary/10 px-1 rounded">q</code> (required): Search query (min 2 characters)</li>
                                <li><code className="text-primary bg-primary/10 px-1 rounded">page</code> (optional): Page number (default: 1)</li>
                            </ul>
                            <h4 className="font-bold text-white mb-3">Response:</h4>
                            <pre className="bg-black/50 p-4 rounded-lg border border-white/5 overflow-x-auto text-sm text-gray-300 font-mono">
{`{
  "results": [
    {
      "id": "12345",
      "title": "Movie Title",
      "cover": "https://...",
      "releaseDate": "2023-01-01",
      "genre": "Action, Drama",
      "rating": 8.5,
      "description": "Movie description..."
    }
  ],
  "hasMore": true,
  "totalCount": 50
}`}
                            </pre>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};
export default ApiDocsView;