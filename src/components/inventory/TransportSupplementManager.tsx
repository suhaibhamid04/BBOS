import React from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Receipt, Edit2, Trash2 } from 'lucide-react';

export const TransportSupplementManager: React.FC = () => {
  const { transportSupplements, addTransportSupplement, deleteTransportSupplement } = useData();
  const { permissions } = useAuth();

  const handleAddMockSupplement = async () => {
    try {
      await addTransportSupplement({
        vehicleCategoryId: 'vcat-01',
        name: 'Night Driving Allowance',
        description: 'Extra charge for driving between 10 PM and 6 AM',
        amount: 500,
        currency: 'INR',
        type: 'PER_DAY',
        mandatory: false
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Transport Supplements</h2>
          <p className="text-sm text-slate-500">Manage extra charges like night allowances or permits.</p>
        </div>
        {permissions.canManageOperations && (
          <button 
            onClick={handleAddMockSupplement}
            className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold shadow-sm transition-colors"
          >
            Add Mock Supplement
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {transportSupplements.map(supp => (
          <div key={supp.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#7056EE]/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{supp.name}</h3>
                  <div className="text-xs text-slate-500 uppercase tracking-wide font-bold">
                    {supp.type}
                  </div>
                </div>
              </div>
              {permissions.canManageOperations && (
                <div className="flex items-center gap-1">
                  <button className="p-1.5 text-slate-400 hover:text-[#7056EE] hover:bg-slate-100 rounded transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteTransportSupplement(supp.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Amount</span>
                <span className="font-semibold text-sm text-slate-900">{supp.currency} {supp.amount}</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Mandatory</span>
                <span className={`font-semibold text-sm ${supp.mandatory ? 'text-rose-600' : 'text-slate-500'}`}>
                  {supp.mandatory ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
            
            <div className="text-xs text-slate-500 text-center font-medium border-t border-slate-100 pt-2">
              Vehicle: {supp.vehicleCategoryId || 'All'}
            </div>
          </div>
        ))}
        {transportSupplements.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
            No supplements found. Add one to get started.
          </div>
        )}
      </div>
    </div>
  );
};
