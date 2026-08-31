import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { Flame, GitPullRequest, Calendar, Phone, MessageSquare, Plus, ArrowRight, Sparkles } from 'lucide-react';

export const MyWorkspaceView: React.FC<{ onNavigate: (section: string, id?: string) => void }> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const { leads, tasks, quotes, bookings } = useData();

  // Filter for assigned data
  const myLeads = leads.filter(l => l.assignedEmployeeId === currentUser.id);
  const myHotLeads = myLeads.filter(l => l.priority === 'HIGH' || l.priority === 'URGENT');
  const myNewLeads = myLeads.filter(l => l.status === 'NEW');
  const myFollowUps = myLeads.filter(l => l.status === 'CONTACTED' || l.status === 'NEGOTIATION');
  const myQuotes = quotes.filter(q => myLeads.some(l => l.id === q.leadId) && (q.status === 'SENT' || q.status === 'DRAFT'));
  const myBookings = bookings.filter(b => myLeads.some(l => l.id === b.leadId) && b.status === 'CONFIRMED');
  
  const myTasks = tasks.filter(t => t.assignedToId === currentUser.id || t.assignedTo === currentUser.name);
  const todaysTasks = myTasks.filter(t => new Date(t.dueAt).toDateString() === new Date().toDateString() && t.status !== 'COMPLETED');
  const overdueTasks = myTasks.filter(t => new Date(t.dueAt) < new Date() && t.status !== 'COMPLETED' && new Date(t.dueAt).toDateString() !== new Date().toDateString());

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">My Workspace</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome back, {currentUser.name}. Here's your pipeline overview.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">My New Leads</div>
          <div className="text-3xl font-bold text-slate-900">{myNewLeads.length}</div>
        </div>
        <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            <Flame className="w-8 h-8 text-rose-100" />
          </div>
          <div className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2 relative z-10">My Hot Leads</div>
          <div className="text-3xl font-bold text-rose-700 relative z-10">{myHotLeads.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Open Quotes</div>
          <div className="text-3xl font-bold text-slate-900">{myQuotes.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">My Bookings</div>
          <div className="text-3xl font-bold text-[#7056EE]">{myBookings.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Priority Leads Section */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                Priority Leads
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {myHotLeads.length > 0 ? myHotLeads.map(lead => (
                <div key={lead.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{lead.customerName}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><GitPullRequest className="w-3 h-3" /> {lead.destination}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {lead.travelStartDate && new Date(lead.travelStartDate).toLocaleDateString()}</span>
                      <span>{lead.travelerCount} Travelers</span>
                      <span className="font-medium text-slate-900">₹{lead.budget?.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right mr-4">
                      <div className="text-xs font-medium text-slate-500">Score</div>
                      <div className="text-sm font-bold text-[#7056EE]">{lead.leadScore}/100</div>
                    </div>
                    <div className="text-right mr-4">
                      <div className="text-xs font-medium text-slate-500">Probability</div>
                      <div className="text-sm font-bold text-emerald-600">{lead.bookingProbability || 0}%</div>
                    </div>
                    <button 
                      onClick={() => onNavigate('lead-detail', lead.id)}
                      className="px-3 py-1.5 bg-[#7056EE] hover:bg-[#5b42d6] text-white text-xs font-medium rounded-md transition-colors"
                    >
                      Open Lead
                    </button>
                    <button className="p-1.5 border border-slate-200 text-slate-600 rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors tooltip-trigger" title="AI Assist">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </button>
                  </div>
                </div>
              )) : (
                <div className="p-8 text-center text-sm text-slate-500">No priority leads at the moment.</div>
              )}
            </div>
          </div>

          {/* Follow-ups */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-900">My Follow-ups</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {myFollowUps.slice(0, 5).map(lead => (
                <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">{lead.customerName}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Last contact: {new Date(lead.lastContactAt).toLocaleDateString()}</p>
                  </div>
                  <button onClick={() => onNavigate('lead-detail', lead.id)} className="text-xs font-medium text-[#7056EE] hover:text-[#5b42d6]">View</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Overdue Tasks */}
          {overdueTasks.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-rose-100 bg-rose-100/50">
                <h2 className="text-xs font-bold text-rose-800 uppercase tracking-wider">Overdue Tasks ({overdueTasks.length})</h2>
              </div>
              <div className="divide-y divide-rose-100">
                {overdueTasks.slice(0, 3).map(task => (
                  <div key={task.id} className="p-4">
                    <h3 className="text-sm font-medium text-rose-900">{task.title}</h3>
                    <p className="text-xs text-rose-700 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Due: {new Date(task.dueAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Tasks */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-900">Today's Tasks</h2>
              <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{todaysTasks.length}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {todaysTasks.length > 0 ? todaysTasks.map(task => (
                <div key={task.id} className="p-4 flex gap-3 hover:bg-slate-50 transition-colors">
                  <div className="mt-0.5">
                    <div className="w-4 h-4 rounded border border-slate-300"></div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">{task.title}</h3>
                    <div className="text-xs text-slate-500 mt-1">{task.description}</div>
                  </div>
                </div>
              )) : (
                <div className="p-6 text-center text-sm text-slate-500">No tasks due today!</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
