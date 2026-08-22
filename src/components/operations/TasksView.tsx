import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Task, Priority } from '../../types';
import { CheckSquare, Plus, CheckCircle2, Clock, User, X, Sparkles } from 'lucide-react';
import { PRESET_USERS } from '../../services/permissions';

export const TasksView: React.FC = () => {
  const { tasks, toggleTaskStatus, createTask } = useData();
  const { currentUser } = useAuth();

  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedToId, setAssignedToId] = useState(currentUser.id);
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [dueAt, setDueAt] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'PENDING') return t.status !== 'COMPLETED';
    if (filter === 'COMPLETED') return t.status === 'COMPLETED';
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    const assignedUser = PRESET_USERS.find((u) => u.id === assignedToId) || currentUser;

    await createTask({
      title,
      description,
      assignedToId: assignedUser.id,
      assignedToName: assignedUser.name,
      priority,
      status: 'PENDING',
      dueAt: `${dueAt}T18:00:00.000Z`,
      source: 'HUMAN',
    });

    setIsCreateOpen(false);
    setTitle('');
    setDescription('');
  };

  return (
    <div id="tasks-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Operational Tasks</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
              {tasks.filter((t) => t.status !== 'COMPLETED').length} Open Tasks
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Follow-up reminders, hotel voucher releases, and AI-triggered operational checklist items
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-slate-200/80 p-1 rounded-xl text-xs">
            {(['PENDING', 'COMPLETED', 'ALL'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                  filter === st ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-3.5 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100">
        {filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No tasks found.</div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              className="p-4 hover:bg-slate-50 flex items-start justify-between gap-4 transition-colors"
            >
              <div className="flex items-start space-x-3 min-w-0">
                <button
                  onClick={() => toggleTaskStatus(task.id)}
                  className="mt-0.5 text-slate-400 hover:text-emerald-600 transition-colors"
                >
                  {task.status === 'COMPLETED' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-md border-2 border-slate-300 hover:border-emerald-500" />
                  )}
                </button>

                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className={`text-xs font-bold ${task.status === 'COMPLETED' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                      {task.title}
                    </h3>
                    <span className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase ${
                      task.source === 'AI' ? 'bg-[#7056EE]/15 text-[#7056EE]' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {task.source === 'AI' ? 'AI Generated' : 'Human Task'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">{task.description}</p>

                  <div className="flex items-center space-x-3 text-[11px] text-slate-400 pt-1">
                    <span className="font-semibold text-slate-700">Assigned: {task.assignedToName}</span>
                    <span>•</span>
                    <span className="flex items-center text-amber-700 font-medium">
                      <Clock className="w-3.5 h-3.5 mr-1" /> Due {new Date(task.dueAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                task.priority === 'URGENT' ? 'bg-rose-100 text-rose-800' :
                task.priority === 'HIGH' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
              }`}>
                {task.priority}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Create Task Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Create Operational Task</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Task Title *</label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Call Gulmarg Gondola liaison for Phase 2 bulk slots"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Task Details</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Additional context or booking reference..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assignee</label>
                  <select
                    value={assignedToId}
                    onChange={(e) => setAssignedToId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    {PRESET_USERS.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
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
                  Save Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
