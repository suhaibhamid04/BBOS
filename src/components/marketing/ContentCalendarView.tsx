import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { APP_CONFIG } from '../../config';
import { Calendar, Plus, Sparkles, X } from 'lucide-react';

export const ContentCalendarView: React.FC = () => {
  const { contentCalendar, createContentItem } = useData();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<'Instagram' | 'Facebook' | 'Meta Ads' | 'Email' | 'YouTube' | 'Blog'>('Instagram');
  const [contentType, setContentType] = useState<'Reel' | 'Carousel' | 'Static Post' | 'Ad Copy' | 'Newsletter' | 'Story'>('Reel');
  const [destination, setDestination] = useState<'Kashmir' | 'Ladakh' | 'Jammu' | 'General'>('Kashmir');
  const [caption, setCaption] = useState('');
  const [visualPrompt, setVisualPrompt] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !caption) return;
    setCreateError(null);
    try {
      await createContentItem({
        title,
        channel,
        contentType,
        destination,
        caption,
        visualPrompt,
        hashtags: [],
        status: 'DRAFT',
        approvalStatus: 'NOT_SUBMITTED',
        scheduledFor: '',
        generatedBy: 'HUMAN',
      });
      setIsCreateOpen(false);
      setTitle('');
      setCaption('');
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'The draft could not be created.');
    }
  };

  return (
    <div id="content-calendar-view" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Content Drafts & Calendar</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-pink-100 text-pink-800">
              {contentCalendar.length} {contentCalendar.length === 1 ? 'Item' : 'Items'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Draft planning workspace. Social publishing and durable production calendar persistence are not implemented.
          </p>
        </div>

        <button
          id="create-content-trigger"
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Draft</span>
        </button>
      </div>

      <p data-testid="content-persistence-notice" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
        {APP_CONFIG.DEMO_MODE ? 'Example and locally saved demo items may be shown.' : 'Items created here are session-only drafts until a server-backed content workflow is implemented.'} Nothing is published or sent to a social platform.
      </p>

      {contentCalendar.length === 0 && (
        <div data-testid="content-calendar-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Calendar className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No content drafts are available</h3>
          <p className="mt-1 text-xs text-slate-500">Create a session draft to plan content. It will not be scheduled or published.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contentCalendar.map((item) => (
          <div
            key={item.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded uppercase">
                  {item.channel} • {item.contentType}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  item.approvalStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                  item.approvalStatus === 'PENDING' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'
                }`}>
                  {item.approvalStatus}
                </span>
              </div>

              <h3 className="text-xs font-bold text-slate-900 leading-snug">{item.title}</h3>
              <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{item.caption}</p>

              {item.visualPrompt && (
                <div className="p-2.5 bg-purple-50/60 border border-purple-200/80 rounded-xl text-[11px] text-purple-900 space-y-1">
                  <span className="font-bold flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-[#7056EE]" />
                    <span>Draft visual brief:</span>
                  </span>
                  <p className="italic">{item.visualPrompt}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{item.scheduledFor || 'Not scheduled'}</span>
              </span>
              <span className="font-semibold text-[#7056EE]">{item.destination}</span>
            </div>
          </div>
        ))}
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Create Marketing Draft</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs">
              {createError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 font-semibold text-red-800">Draft unavailable: {createError}</p>}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Post Title *</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 5 Secret Locations in Pahalgam Most Tourists Miss"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Channel</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Meta Ads">Meta Ads</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Format</label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="Reel">Reel Script</option>
                    <option value="Carousel">Carousel (10 Slides)</option>
                    <option value="Static Post">Static Post</option>
                    <option value="Ad Copy">Ad Copy</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Caption / Copy *</label>
                <textarea
                  required
                  rows={3}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write the post caption or hook..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Draft image / video brief</label>
                <input
                  type="text"
                  value={visualPrompt}
                  onChange={(e) => setVisualPrompt(e.target.value)}
                  placeholder="Cinematic drone sweep over Betaab valley surrounded by misty pine trees..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#7056EE] text-white font-bold rounded-lg"
                >
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
