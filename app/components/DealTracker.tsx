'use client';

import React, { useState, useEffect } from 'react';
import { Plus, X, Settings, Edit2, Trash2, Mail, Phone, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const STAGES = ['Meeting Booked', 'Discovery', 'Demo', 'Scope', 'Vendor Decision', 'Proposal', 'SLIP', 'Closed Won'];
const FORECAST_CATEGORIES = ['Pipeline', 'Best Case', 'Upside', 'Commit', 'Closed Won'];
const ENGAGEMENT_STATUSES = ['Not Contacted', 'Emailed', 'Responded', 'Meeting Attended'];

// Types
interface Stakeholder {
  id: number;
  name: string;
  title: string;
  email?: string;
  phone?: string;
  engagementStatus: string;
}

interface Deal {
  id: number;
  user_id?: string;
  companyName: string;
  value: number;
  forecastCategory: string;
  closeDate: string;
  stage: string;
  previousStage?: string;
  createdAt: string;
  lastContacted: string | null;
  notes: string;
  stakeholders: Stakeholder[];
  nurturesSent: Record<number, string>;
}

interface Nurture {
  id: number;
  user_id?: string;
  name: string;
  content: string;
  createdAt?: string;
}

// Convert database row (snake_case) to app format (camelCase)
const dbToApp = (row: any): Deal => ({
  id: row.id,
  user_id: row.user_id,
  companyName: row.company_name,
  value: row.value,
  forecastCategory: row.forecast_category,
  closeDate: row.close_date,
  stage: row.stage,
  previousStage: row.previous_stage,
  createdAt: row.created_at,
  lastContacted: row.last_contacted,
  notes: row.notes || '',
  stakeholders: row.stakeholders || [],
  nurturesSent: row.nurtures_sent || {},
});

// Convert app format (camelCase) to database row (snake_case)
const appToDb = (deal: Partial<Deal>): any => {
  const result: any = {};
  if (deal.companyName !== undefined) result.company_name = deal.companyName;
  if (deal.value !== undefined) result.value = deal.value;
  if (deal.forecastCategory !== undefined) result.forecast_category = deal.forecastCategory;
  if (deal.closeDate !== undefined) result.close_date = deal.closeDate;
  if (deal.stage !== undefined) result.stage = deal.stage;
  if (deal.previousStage !== undefined) result.previous_stage = deal.previousStage;
  if (deal.createdAt !== undefined) result.created_at = deal.createdAt;
  if (deal.lastContacted !== undefined) result.last_contacted = deal.lastContacted;
  if (deal.notes !== undefined) result.notes = deal.notes;
  if (deal.stakeholders !== undefined) result.stakeholders = deal.stakeholders;
  if (deal.nurturesSent !== undefined) result.nurtures_sent = deal.nurturesSent;
  return result;
};

const dbToNurture = (row: any): Nurture => ({
  id: row.id,
  user_id: row.user_id,
  name: row.name,
  content: row.content,
  createdAt: row.created_at,
});

const DealTracker = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [onHoldDeals, setOnHoldDeals] = useState<Deal[]>([]);
  const [nurtures, setNurtures] = useState<Nurture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [view, setView] = useState('pipeline');
  const [showSettings, setShowSettings] = useState(false);
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showLostConfirm, setShowLostConfirm] = useState<number | null>(null);
  const [showBackup, setShowBackup] = useState(false);
  const [backupData, setBackupData] = useState('');
  const [showRestore, setShowRestore] = useState(false);
  const [restoreData, setRestoreData] = useState('');
  const [filterForecast, setFilterForecast] = useState<string>('all');
  const [filterCloseDate, setFilterCloseDate] = useState<string>('all');
  const [onHoldSortOrder, setOnHoldSortOrder] = useState<'asc' | 'desc'>('asc');

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }
      setUserId(user.id);

      const [dealsResult, onHoldResult, nurturesResult] = await Promise.all([
        supabase.from('deals').select('*'),
        supabase.from('on_hold_deals').select('*'),
        supabase.from('nurtures').select('*'),
      ]);

      if (dealsResult.error) throw dealsResult.error;
      if (onHoldResult.error) throw onHoldResult.error;
      if (nurturesResult.error) throw nurturesResult.error;

      setDeals((dealsResult.data || []).map(dbToApp));
      setOnHoldDeals((onHoldResult.data || []).map(dbToApp));

      if (nurturesResult.data && nurturesResult.data.length > 0) {
        setNurtures(nurturesResult.data.map(dbToNurture));
      } else {
        // Insert default nurtures
        const defaultNurtures = [
          { user_id: user.id, name: 'Introduction Email', content: 'Hi [Name], I wanted to reach out about...' },
          { user_id: user.id, name: 'Case Study Share', content: 'Link to relevant case study' },
          { user_id: user.id, name: 'Product Overview', content: 'Overview of HR Acuity capabilities' },
        ];

        const { data: insertedNurtures, error: insertError } = await supabase
          .from('nurtures')
          .insert(defaultNurtures)
          .select();

        if (insertError) throw insertError;
        setNurtures((insertedNurtures || []).map(dbToNurture));
      }

      toast.success('Data loaded successfully');
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast.error(`Failed to load data: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const copyBackup = () => {
    const data = {
      deals,
      onHoldDeals,
      nurtures,
      exportDate: new Date().toISOString()
    };
    setBackupData(JSON.stringify(data, null, 2));
    setShowBackup(true);
  };

  const restoreFromBackup = async () => {
    setIsSaving(true);
    try {
      if (!userId) {
        throw new Error('Not authenticated');
      }

      const imported = JSON.parse(restoreData);

      // Clear existing data and insert new data
      if (imported.deals && imported.deals.length > 0) {
        await supabase.from('deals').delete().neq('id', 0);
        const { error } = await supabase.from('deals').insert(
          imported.deals.map((d: Deal) => ({ ...appToDb(d), user_id: userId }))
        );
        if (error) throw error;
        setDeals(imported.deals);
      }

      if (imported.onHoldDeals && imported.onHoldDeals.length > 0) {
        await supabase.from('on_hold_deals').delete().neq('id', 0);
        const { error } = await supabase.from('on_hold_deals').insert(
          imported.onHoldDeals.map((d: Deal) => ({ ...appToDb(d), user_id: userId }))
        );
        if (error) throw error;
        setOnHoldDeals(imported.onHoldDeals);
      }

      if (imported.nurtures && imported.nurtures.length > 0) {
        await supabase.from('nurtures').delete().neq('id', 0);
        const { error } = await supabase.from('nurtures').insert(
          imported.nurtures.map((n: Nurture) => ({ name: n.name, content: n.content, user_id: userId }))
        );
        if (error) throw error;
        setNurtures(imported.nurtures);
      }

      setShowRestore(false);
      setRestoreData('');
      toast.success('Data restored successfully!');
    } catch (error: any) {
      toast.error(`Error restoring data: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const createDeal = async (dealData: {
    companyName: string;
    value: number;
    forecastCategory: string;
    closeDate: string;
    stage: string;
    startOnHold?: boolean;
  }) => {
    setIsSaving(true);
    try {
      if (!userId) {
        throw new Error('Not authenticated');
      }

      const newDealData = {
        user_id: userId,
        company_name: dealData.companyName,
        value: dealData.value,
        forecast_category: dealData.forecastCategory,
        close_date: dealData.closeDate,
        stage: dealData.stage || 'Discovery',
        notes: '',
        stakeholders: [],
        nurtures_sent: {},
      };

      const table = dealData.startOnHold ? 'on_hold_deals' : 'deals';
      const { data, error } = await supabase
        .from(table)
        .insert([newDealData])
        .select()
        .single();

      if (error) throw error;

      const newDeal = dbToApp(data);
      if (dealData.startOnHold) {
        setOnHoldDeals([...onHoldDeals, newDeal]);
      } else {
        setDeals([...deals, newDeal]);
      }

      setShowNewDeal(false);
      toast.success('Deal created successfully');
    } catch (error: any) {
      toast.error(`Failed to create deal: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateDeal = async (dealId: number, updates: Partial<Deal>, isOnHold: boolean = false) => {
    setIsSaving(true);
    try {
      const dbUpdates = appToDb(updates);
      const table = isOnHold ? 'on_hold_deals' : 'deals';

      const { data, error } = await supabase
        .from(table)
        .update(dbUpdates)
        .eq('id', dealId)
        .select()
        .single();

      if (error) throw error;

      const updatedDeal = dbToApp(data);
      if (isOnHold) {
        setOnHoldDeals(prev => prev.map(d => d.id === dealId ? updatedDeal : d));
      } else {
        setDeals(prev => prev.map(d => d.id === dealId ? updatedDeal : d));
      }
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(updatedDeal);
      }
    } catch (error: any) {
      toast.error(`Failed to update deal: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const moveDealToOnHold = async (dealId: number) => {
    setIsSaving(true);
    try {
      const deal = deals.find(d => d.id === dealId);
      if (!deal) return;

      // Get the full deal data from DB
      const { data: dealData, error: fetchError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .single();

      if (fetchError) throw fetchError;

      // Insert into on_hold_deals with previous_stage (without id, let DB generate new one)
      const { id, ...dealWithoutId } = dealData;
      const { data: newOnHoldDeal, error: insertError } = await supabase
        .from('on_hold_deals')
        .insert([{ ...dealWithoutId, previous_stage: dealData.stage }])
        .select()
        .single();

      if (insertError) throw insertError;

      // Delete from deals
      const { error: deleteError } = await supabase
        .from('deals')
        .delete()
        .eq('id', dealId);

      if (deleteError) throw deleteError;

      setOnHoldDeals([...onHoldDeals, dbToApp(newOnHoldDeal)]);
      setDeals(deals.filter(d => d.id !== dealId));
      setSelectedDeal(null);
      toast.success('Deal moved to On Hold');
    } catch (error: any) {
      toast.error(`Failed to move deal: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const moveDealFromOnHold = async (dealId: number, stage: string) => {
    setIsSaving(true);
    try {
      const deal = onHoldDeals.find(d => d.id === dealId);
      if (!deal) return;

      // Get the full deal data from DB
      const { data: dealData, error: fetchError } = await supabase
        .from('on_hold_deals')
        .select('*')
        .eq('id', dealId)
        .single();

      if (fetchError) throw fetchError;

      // Insert into deals with new stage (without id and previous_stage, as deals table doesn't have previous_stage)
      const { id, previous_stage, ...dealWithoutIdAndPreviousStage } = dealData;
      const { data: newDeal, error: insertError } = await supabase
        .from('deals')
        .insert([{ ...dealWithoutIdAndPreviousStage, stage }])
        .select()
        .single();

      if (insertError) throw insertError;

      // Delete from on_hold_deals
      const { error: deleteError } = await supabase
        .from('on_hold_deals')
        .delete()
        .eq('id', dealId);

      if (deleteError) throw deleteError;

      setDeals([...deals, dbToApp(newDeal)]);
      setOnHoldDeals(onHoldDeals.filter(d => d.id !== dealId));
      setSelectedDeal(null);
      toast.success('Deal moved to pipeline');
    } catch (error: any) {
      toast.error(`Failed to move deal: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteDeal = async (dealId: number) => {
    setIsSaving(true);
    try {
      // Try deleting from both tables
      await supabase.from('deals').delete().eq('id', dealId);
      await supabase.from('on_hold_deals').delete().eq('id', dealId);

      setDeals(deals.filter(d => d.id !== dealId));
      setOnHoldDeals(onHoldDeals.filter(d => d.id !== dealId));
      setSelectedDeal(null);
      setShowLostConfirm(null);
      toast.success('Deal deleted');
    } catch (error: any) {
      toast.error(`Failed to delete deal: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const moveStage = (dealId: number, newStage: string) => {
    updateDeal(dealId, { stage: newStage }, false);
  };

  const addStakeholder = (dealId: number, stakeholderData: Omit<Stakeholder, 'id' | 'engagementStatus'>, isOnHold: boolean) => {
    const dealList = isOnHold ? onHoldDeals : deals;
    const deal = dealList.find(d => d.id === dealId);
    if (!deal) return;

    const newStakeholder: Stakeholder = {
      id: Date.now(),
      ...stakeholderData,
      engagementStatus: 'Not Contacted',
    };

    const newStakeholders = [...(deal.stakeholders || []), newStakeholder];
    updateDeal(dealId, { stakeholders: newStakeholders }, isOnHold);
  };

  const updateStakeholder = (dealId: number, stakeholderId: number, updates: Partial<Stakeholder>, isOnHold: boolean) => {
    const dealList = isOnHold ? onHoldDeals : deals;
    const deal = dealList.find(d => d.id === dealId);
    if (!deal) return;

    const newStakeholders = deal.stakeholders.map(s =>
      s.id === stakeholderId ? { ...s, ...updates } : s
    );
    updateDeal(dealId, { stakeholders: newStakeholders }, isOnHold);
  };

  const deleteStakeholder = (dealId: number, stakeholderId: number, isOnHold: boolean) => {
    const dealList = isOnHold ? onHoldDeals : deals;
    const deal = dealList.find(d => d.id === dealId);
    if (!deal) return;

    const newStakeholders = deal.stakeholders.filter(s => s.id !== stakeholderId);
    updateDeal(dealId, { stakeholders: newStakeholders }, isOnHold);
  };

  const markNurtureSent = (dealId: number, nurtureId: number, isOnHold: boolean) => {
    const dealList = isOnHold ? onHoldDeals : deals;
    const deal = dealList.find(d => d.id === dealId);
    if (!deal) return;

    const updates = {
      nurturesSent: {
        ...(deal.nurturesSent || {}),
        [nurtureId]: new Date().toISOString()
      },
      lastContacted: new Date().toISOString()
    };
    updateDeal(dealId, updates, isOnHold);
  };

  const addNurture = async (nurtureData: { name: string; content: string }) => {
    setIsSaving(true);
    try {
      if (!userId) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase
        .from('nurtures')
        .insert([{ ...nurtureData, user_id: userId }])
        .select()
        .single();

      if (error) throw error;

      setNurtures([...nurtures, dbToNurture(data)]);
      toast.success('Nurture added');
    } catch (error: any) {
      toast.error(`Failed to add nurture: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteNurture = async (nurtureId: number) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('nurtures')
        .delete()
        .eq('id', nurtureId);

      if (error) throw error;

      setNurtures(nurtures.filter(n => n.id !== nurtureId));
      toast.success('Nurture deleted');
    } catch (error: any) {
      toast.error(`Failed to delete nurture: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter deals based on selected filters
  const getFilteredDeals = (dealsList: Deal[]) => {
    return dealsList.filter(deal => {
      // Forecast filter
      if (filterForecast !== 'all' && deal.forecastCategory !== filterForecast) {
        return false;
      }

      // Close date filter
      if (filterCloseDate !== 'all') {
        const closeDate = new Date(deal.closeDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const endOfQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3 + 3, 0);

        switch (filterCloseDate) {
          case 'this-week':
            if (closeDate > endOfWeek) return false;
            break;
          case 'this-month':
            if (closeDate > endOfMonth) return false;
            break;
          case 'this-quarter':
            if (closeDate > endOfQuarter) return false;
            break;
          case 'overdue':
            if (closeDate >= today) return false;
            break;
        }
      }

      return true;
    });
  };

  const filteredDeals = getFilteredDeals(deals);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
          <p className="text-gray-800">Loading deals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 z-50">
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving...
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-gray-900">Deal Pipeline</h1>
          <div className="flex gap-2">
            <button
              onClick={copyBackup}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              title="Copy backup data"
            >
              Backup
            </button>
            <button
              onClick={() => setShowRestore(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              title="Restore from backup"
            >
              Restore
            </button>
            <button
              onClick={() => setView(view === 'pipeline' ? 'onhold' : 'pipeline')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              {view === 'pipeline' ? 'View On Hold' : 'View Pipeline'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              <Settings size={20} />
            </button>
            <button
              onClick={() => setShowNewDeal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={20} /> New Deal
            </button>
          </div>
        </div>

        {/* Filters */}
        {view === 'pipeline' && (
          <div className="flex gap-4 mb-6 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Forecast:</label>
              <select
                value={filterForecast}
                onChange={(e) => setFilterForecast(e.target.value)}
                className="p-2 border rounded-lg text-gray-900 text-sm"
              >
                <option value="all">All Categories</option>
                {FORECAST_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Close Date:</label>
              <select
                value={filterCloseDate}
                onChange={(e) => setFilterCloseDate(e.target.value)}
                className="p-2 border rounded-lg text-gray-900 text-sm"
              >
                <option value="all">All Dates</option>
                <option value="overdue">Overdue</option>
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="this-quarter">This Quarter</option>
              </select>
            </div>
            {(filterForecast !== 'all' || filterCloseDate !== 'all') && (
              <button
                onClick={() => {
                  setFilterForecast('all');
                  setFilterCloseDate('all');
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Clear Filters
              </button>
            )}
            <span className="text-sm text-gray-700 ml-auto">
              Showing {filteredDeals.length} of {deals.length} deals
            </span>
          </div>
        )}

        {/* Pipeline View */}
        {view === 'pipeline' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Column Headers */}
            <div className="grid grid-cols-8 border-b bg-gray-50">
              {STAGES.map(stage => {
                const stageDeals = filteredDeals.filter(d => d.stage === stage);
                const stageTotal = stageDeals.reduce((sum, d) => sum + d.value, 0);
                return (
                  <div key={stage} className="p-3 border-r last:border-r-0 text-center">
                    <h3 className="font-semibold text-gray-900 text-sm">{stage}</h3>
                    <p className="text-xs text-gray-700 mt-1">
                      {stageDeals.length} deals · ${stageTotal.toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* Column Content */}
            <div className="grid grid-cols-8 min-h-[500px]">
              {STAGES.map(stage => (
                <div key={stage} className="border-r last:border-r-0 p-2 bg-gray-50/50">
                  <div className="space-y-2">
                    {filteredDeals.filter(d => d.stage === stage).map(deal => (
                      <DealRow
                        key={deal.id}
                        deal={deal}
                        onClick={() => {
                          setSelectedDeal(deal);
                          setActiveTab('overview');
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* On Hold View */}
        {view === 'onhold' && (() => {
          const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
          const getQuarter = (dateStr: string) => {
            const month = new Date(dateStr).getMonth();
            if (month < 3) return 'Q1';
            if (month < 6) return 'Q2';
            if (month < 9) return 'Q3';
            return 'Q4';
          };

          return (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b">
                <h2 className="text-xl font-semibold text-gray-900">On Hold Deals ({onHoldDeals.length})</h2>
                <p className="text-sm text-gray-700 mt-1">Organized by expected close quarter</p>
              </div>
              {/* Quarter Headers */}
              <div className="grid grid-cols-4 border-b bg-yellow-50">
                {QUARTERS.map(quarter => {
                  const quarterDeals = onHoldDeals.filter(d => getQuarter(d.closeDate) === quarter);
                  const quarterTotal = quarterDeals.reduce((sum, d) => sum + d.value, 0);
                  return (
                    <div key={quarter} className="p-3 border-r last:border-r-0 text-center">
                      <h3 className="font-semibold text-gray-900 text-lg">{quarter}</h3>
                      <p className="text-xs text-gray-700 mt-1">
                        {quarterDeals.length} deals · ${quarterTotal.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* Quarter Columns */}
              <div className="grid grid-cols-4 min-h-[400px]">
                {QUARTERS.map(quarter => (
                  <div key={quarter} className="border-r last:border-r-0 p-2 bg-yellow-50/30">
                    <div className="space-y-2">
                      {onHoldDeals
                        .filter(d => getQuarter(d.closeDate) === quarter)
                        .sort((a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime())
                        .map(deal => (
                          <OnHoldDealRow
                            key={deal.id}
                            deal={deal}
                            onClick={() => {
                              setSelectedDeal(deal);
                              setActiveTab('overview');
                            }}
                          />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Modals */}
        {showNewDeal && (
          <NewDealModal
            onClose={() => setShowNewDeal(false)}
            onSave={createDeal}
          />
        )}

        {selectedDeal && (() => {
          const isOnHold = !deals.find(d => d.id === selectedDeal.id);
          return (
            <DealDetailModal
              deal={selectedDeal}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onClose={() => setSelectedDeal(null)}
              onUpdate={(updates) => updateDeal(selectedDeal.id, updates, isOnHold)}
              onMoveToOnHold={() => setShowLostConfirm(selectedDeal.id)}
              onMoveFromOnHold={(stage) => moveDealFromOnHold(selectedDeal.id, stage)}
              onMarkLost={() => deleteDeal(selectedDeal.id)}
              onMoveStage={(stage) => moveStage(selectedDeal.id, stage)}
              onAddStakeholder={(stakeholder) => addStakeholder(selectedDeal.id, stakeholder, isOnHold)}
              onUpdateStakeholder={(stakeholderId, updates) => updateStakeholder(selectedDeal.id, stakeholderId, updates, isOnHold)}
              onDeleteStakeholder={(stakeholderId) => deleteStakeholder(selectedDeal.id, stakeholderId, isOnHold)}
              onMarkNurtureSent={(nurtureId) => markNurtureSent(selectedDeal.id, nurtureId, isOnHold)}
              nurtures={nurtures}
              isOnHold={isOnHold}
            />
          );
        })()}

        {showSettings && (
          <SettingsModal
            nurtures={nurtures}
            onClose={() => setShowSettings(false)}
            onAddNurture={addNurture}
            onDeleteNurture={deleteNurture}
          />
        )}

        {showLostConfirm && (
          <LostConfirmModal
            onMoveToOnHold={() => {
              moveDealToOnHold(showLostConfirm);
              setShowLostConfirm(null);
            }}
            onMarkLost={() => {
              deleteDeal(showLostConfirm);
            }}
            onCancel={() => setShowLostConfirm(null)}
          />
        )}

        {/* Backup Modal */}
        {showBackup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full p-6">
              <h3 className="text-xl font-bold mb-4">Backup Data</h3>
              <p className="text-sm text-gray-800 mb-3">
                Copy this JSON and save it somewhere safe (Notes app, Google Doc, etc). You can use it to restore your data later.
              </p>
              <textarea
                readOnly
                value={backupData}
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                className="w-full h-96 p-3 border rounded-lg font-mono text-xs mb-3"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(backupData);
                    toast.success('Copied to clipboard!');
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={() => setShowBackup(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Modal */}
        {showRestore && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full p-6">
              <h3 className="text-xl font-bold mb-4">Restore from Backup</h3>
              <p className="text-sm text-gray-800 mb-3">
                Paste your backup JSON here to restore your data. This will replace all current data.
              </p>
              <textarea
                value={restoreData}
                onChange={(e) => setRestoreData(e.target.value)}
                placeholder="Paste your backup JSON here..."
                className="w-full h-96 p-3 border rounded-lg font-mono text-xs mb-3"
              />
              <div className="flex gap-3">
                <button
                  onClick={restoreFromBackup}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Restoring...' : 'Restore Data'}
                </button>
                <button
                  onClick={() => {
                    setShowRestore(false);
                    setRestoreData('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Deal Row Component (for pipeline columns)
const DealRow = ({ deal, onClick }: { deal: Deal; onClick: () => void }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const isOverdue = new Date(deal.closeDate) < new Date();

  return (
    <div
      onClick={onClick}
      className="p-2 bg-white rounded border border-gray-200 cursor-pointer hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <h4 className="font-medium text-gray-900 text-sm truncate">{deal.companyName}</h4>
      <div className="flex justify-between items-center mt-1">
        <span className="text-xs font-semibold text-gray-900">{formatCurrency(deal.value)}</span>
        <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
          {new Date(deal.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <div className="mt-1">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          deal.forecastCategory === 'Closed Won' ? 'bg-green-100 text-green-800' :
          deal.forecastCategory === 'Commit' ? 'bg-blue-100 text-blue-800' :
          deal.forecastCategory === 'Upside' ? 'bg-yellow-100 text-yellow-800' :
          deal.forecastCategory === 'Best Case' ? 'bg-orange-100 text-orange-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {deal.forecastCategory}
        </span>
      </div>
    </div>
  );
};

// On Hold Deal Row Component (for quarterly columns)
const OnHoldDealRow = ({ deal, onClick }: { deal: Deal; onClick: () => void }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div
      onClick={onClick}
      className="p-2 bg-white rounded border border-yellow-200 cursor-pointer hover:border-yellow-400 hover:shadow-sm transition-all"
    >
      <h4 className="font-medium text-gray-900 text-sm truncate">{deal.companyName}</h4>
      <div className="flex justify-between items-center mt-1">
        <span className="text-xs font-semibold text-gray-900">{formatCurrency(deal.value)}</span>
        <span className="text-xs text-gray-600">
          {new Date(deal.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      {deal.previousStage && (
        <div className="mt-1">
          <span className="text-xs text-gray-600">Was: {deal.previousStage}</span>
        </div>
      )}
      <div className="mt-1">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          deal.forecastCategory === 'Closed Won' ? 'bg-green-100 text-green-800' :
          deal.forecastCategory === 'Commit' ? 'bg-blue-100 text-blue-800' :
          deal.forecastCategory === 'Upside' ? 'bg-yellow-100 text-yellow-800' :
          deal.forecastCategory === 'Best Case' ? 'bg-orange-100 text-orange-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {deal.forecastCategory}
        </span>
      </div>
    </div>
  );
};

// Deal Card Component (kept for potential future use)
const DealCard = ({ deal, onClick, isOnHold }: { deal: Deal; onClick: () => void; isOnHold?: boolean }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border-2 cursor-pointer hover:shadow-md transition-shadow text-gray-900 ${
        isOnHold ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'
      }`}
    >
      <h4 className="font-semibold text-gray-900 mb-2">{deal.companyName}</h4>
      <div className="text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-800">Value:</span>
          <span className="font-medium text-gray-900">{formatCurrency(deal.value)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-800">Close:</span>
          <span className="font-medium text-gray-900">{formatDate(deal.closeDate)}</span>
        </div>
        <div className="mt-2">
          <span className={`text-xs px-2 py-1 rounded ${
            deal.forecastCategory === 'Closed Won' ? 'bg-green-100 text-green-800' :
            deal.forecastCategory === 'Commit' ? 'bg-blue-100 text-blue-800' :
            deal.forecastCategory === 'Upside' ? 'bg-yellow-100 text-yellow-800' :
            deal.forecastCategory === 'Best Case' ? 'bg-orange-100 text-orange-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {deal.forecastCategory}
          </span>
        </div>
      </div>
    </div>
  );
};

// New Deal Modal
const NewDealModal = ({ onClose, onSave }: {
  onClose: () => void;
  onSave: (data: { companyName: string; value: number; forecastCategory: string; closeDate: string; stage: string; startOnHold: boolean }) => void
}) => {
  const [companyName, setCompanyName] = useState('');
  const [value, setValue] = useState('');
  const [forecastCategory, setForecastCategory] = useState('Pipeline');
  const [closeDate, setCloseDate] = useState('');
  const [stage, setStage] = useState('Discovery');
  const [startOnHold, setStartOnHold] = useState(false);

  const handleSubmit = () => {
    if (!companyName.trim()) {
      toast.error('Please enter a company name');
      return;
    }

    if (!closeDate) {
      toast.error('Please select a close date');
      return;
    }

    const dealValue = parseInt(value);
    if (!dealValue || dealValue <= 0) {
      toast.error('Please enter a valid deal value');
      return;
    }

    onSave({
      companyName,
      value: dealValue,
      forecastCategory,
      closeDate,
      stage,
      startOnHold
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-xl font-bold mb-4">New Deal</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name *
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deal Value *
            </label>
            <input
              type="number"
              required
              min="1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
              placeholder="50000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Forecast Category
            </label>
            <select
              value={forecastCategory}
              onChange={(e) => setForecastCategory(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
            >
              {FORECAST_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expected Close Date *
            </label>
            <input
              type="date"
              required
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <input
              type="checkbox"
              id="startOnHold"
              checked={startOnHold}
              onChange={(e) => setStartOnHold(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="startOnHold" className="text-sm font-medium text-gray-700 cursor-pointer">
              Start in &quot;On Hold&quot; (for closed or paused deals)
            </label>
          </div>

          {!startOnHold && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Initial Stage
              </label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="w-full p-2 border rounded-lg text-gray-900"
              >
                {STAGES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Deal
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Deal Detail Modal
const DealDetailModal = ({
  deal,
  activeTab,
  setActiveTab,
  onClose,
  onUpdate,
  onMoveToOnHold,
  onMoveFromOnHold,
  onMarkLost,
  onMoveStage,
  onAddStakeholder,
  onUpdateStakeholder,
  onDeleteStakeholder,
  onMarkNurtureSent,
  nurtures,
  isOnHold
}: {
  deal: Deal;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose: () => void;
  onUpdate: (updates: Partial<Deal>) => void;
  onMoveToOnHold: () => void;
  onMoveFromOnHold: (stage: string) => void;
  onMarkLost: () => void;
  onMoveStage: (stage: string) => void;
  onAddStakeholder: (stakeholder: Omit<Stakeholder, 'id' | 'engagementStatus'>) => void;
  onUpdateStakeholder: (stakeholderId: number, updates: Partial<Stakeholder>) => void;
  onDeleteStakeholder: (stakeholderId: number) => void;
  onMarkNurtureSent: (nurtureId: number) => void;
  nurtures: Nurture[];
  isOnHold: boolean;
}) => {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(deal.notes || '');
  const [showAddStakeholder, setShowAddStakeholder] = useState(false);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{deal.companyName}</h2>
            <div className="flex gap-4 mt-2 text-sm text-gray-800">
              <span>Value: ${deal.value?.toLocaleString()}</span>
              <span>Close: {new Date(deal.closeDate).toLocaleDateString()}</span>
              <span className="font-medium">{deal.forecastCategory}</span>
            </div>
            {deal.lastContacted && (
              <div className="mt-1 text-xs text-gray-700 flex items-center gap-1">
                <Clock size={12} />
                Last contacted: {formatDateTime(deal.lastContacted)}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex px-6">
            {['overview', 'notes', 'stakeholders', 'nurtures'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-800 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              deal={deal}
              isOnHold={isOnHold}
              onUpdate={onUpdate}
              onMoveStage={onMoveStage}
              onMoveFromOnHold={onMoveFromOnHold}
              onMoveToOnHold={onMoveToOnHold}
              onMarkLost={onMarkLost}
            />
          )}

          {activeTab === 'notes' && (
            <NotesTab
              notes={notes}
              editingNotes={editingNotes}
              setNotes={setNotes}
              setEditingNotes={setEditingNotes}
              onSave={() => {
                onUpdate({ notes });
                setEditingNotes(false);
              }}
              onCancel={() => {
                setNotes(deal.notes || '');
                setEditingNotes(false);
              }}
            />
          )}

          {activeTab === 'stakeholders' && (
            <StakeholdersTab
              stakeholders={deal.stakeholders || []}
              showAddStakeholder={showAddStakeholder}
              setShowAddStakeholder={setShowAddStakeholder}
              onAddStakeholder={onAddStakeholder}
              onUpdateStakeholder={onUpdateStakeholder}
              onDeleteStakeholder={onDeleteStakeholder}
            />
          )}

          {activeTab === 'nurtures' && (
            <NurturesTab
              nurtures={nurtures}
              nurturesSent={deal.nurturesSent || {}}
              onMarkNurtureSent={onMarkNurtureSent}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Overview Tab
const OverviewTab = ({ deal, isOnHold, onUpdate, onMoveStage, onMoveFromOnHold, onMoveToOnHold, onMarkLost }: {
  deal: Deal;
  isOnHold: boolean;
  onUpdate: (updates: Partial<Deal>) => void;
  onMoveStage: (stage: string) => void;
  onMoveFromOnHold: (stage: string) => void;
  onMoveToOnHold: () => void;
  onMarkLost: () => void;
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
          {isOnHold ? (
            <div>
              <p className="text-sm text-gray-800 mb-2">Currently On Hold</p>
              {deal.previousStage && (
                <p className="text-sm text-gray-700 mb-2">
                  Previous Stage: <span className="font-medium text-gray-900">{deal.previousStage}</span>
                </p>
              )}
              <select
                onChange={(e) => e.target.value && onMoveFromOnHold(e.target.value)}
                className="w-full p-2 border rounded-lg text-gray-900"
                defaultValue=""
              >
                <option value="" disabled>Move to stage...</option>
                {STAGES.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
          ) : (
            <select
              value={deal.stage}
              onChange={(e) => onMoveStage(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
            >
              {STAGES.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Forecast</label>
          <select
            value={deal.forecastCategory}
            onChange={(e) => onUpdate({ forecastCategory: e.target.value })}
            className="w-full p-2 border rounded-lg text-gray-900"
          >
            {FORECAST_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
          <input
            type="number"
            value={deal.value}
            onChange={(e) => onUpdate({ value: parseInt(e.target.value) || 0 })}
            className="w-full p-2 border rounded-lg text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Close Date</label>
          <input
            type="date"
            value={deal.closeDate?.split('T')[0] || ''}
            onChange={(e) => onUpdate({ closeDate: e.target.value })}
            className="w-full p-2 border rounded-lg text-gray-900"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        {!isOnHold && (
          <button
            onClick={onMoveToOnHold}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
          >
            Move to On Hold
          </button>
        )}
        <button
          onClick={onMarkLost}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Mark as Lost
        </button>
      </div>
    </div>
  );
};

// Notes Tab
const NotesTab = ({ notes, editingNotes, setNotes, setEditingNotes, onSave, onCancel }: {
  notes: string;
  editingNotes: boolean;
  setNotes: (notes: string) => void;
  setEditingNotes: (editing: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  if (editingNotes) {
    return (
      <div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-64 p-3 border rounded-lg"
          placeholder="Add notes about this deal..."
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setEditingNotes(true)}
        className="mb-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
      >
        <Edit2 size={16} /> Edit Notes
      </button>
      <div className="whitespace-pre-wrap text-gray-700">
        {notes || 'No notes yet.'}
      </div>
    </div>
  );
};

// Stakeholders Tab
const StakeholdersTab = ({
  stakeholders,
  showAddStakeholder,
  setShowAddStakeholder,
  onAddStakeholder,
  onUpdateStakeholder,
  onDeleteStakeholder
}: {
  stakeholders: Stakeholder[];
  showAddStakeholder: boolean;
  setShowAddStakeholder: (show: boolean) => void;
  onAddStakeholder: (stakeholder: Omit<Stakeholder, 'id' | 'engagementStatus'>) => void;
  onUpdateStakeholder: (stakeholderId: number, updates: Partial<Stakeholder>) => void;
  onDeleteStakeholder: (stakeholderId: number) => void;
}) => {
  return (
    <div>
      <button
        onClick={() => setShowAddStakeholder(true)}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
      >
        <Plus size={16} /> Add Stakeholder
      </button>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {stakeholders.map(stakeholder => (
          <StakeholderCard
            key={stakeholder.id}
            stakeholder={stakeholder}
            onUpdateStatus={(status) => onUpdateStakeholder(stakeholder.id, { engagementStatus: status })}
            onDelete={() => onDeleteStakeholder(stakeholder.id)}
          />
        ))}
        {stakeholders.length === 0 && (
          <p className="text-gray-700">No stakeholders added yet.</p>
        )}
      </div>

      {showAddStakeholder && (
        <AddStakeholderModal
          onClose={() => setShowAddStakeholder(false)}
          onSave={(stakeholder) => {
            onAddStakeholder(stakeholder);
            setShowAddStakeholder(false);
          }}
        />
      )}
    </div>
  );
};

// Stakeholder Card
const StakeholderCard = ({ stakeholder, onUpdateStatus, onDelete }: {
  stakeholder: Stakeholder;
  onUpdateStatus: (status: string) => void;
  onDelete: () => void;
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Not Contacted':
        return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
      case 'Emailed':
        return 'bg-blue-100 text-blue-700 hover:bg-blue-200';
      case 'Responded':
        return 'bg-green-100 text-green-700 hover:bg-green-200';
      case 'Meeting Attended':
        return 'bg-purple-100 text-purple-700 hover:bg-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 hover:bg-gray-200';
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h4 className="font-medium text-gray-900">{stakeholder.name}</h4>
          <p className="text-sm text-gray-800">{stakeholder.title}</p>
          {stakeholder.email && (
            <p className="text-sm text-gray-700 flex items-center gap-1 mt-1">
              <Mail size={12} /> {stakeholder.email}
            </p>
          )}
          {stakeholder.phone && (
            <p className="text-sm text-gray-700 flex items-center gap-1">
              <Phone size={12} /> {stakeholder.phone}
            </p>
          )}
        </div>
        <button
          onClick={onDelete}
          className="text-red-600 hover:text-red-700"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ENGAGEMENT_STATUSES.map(status => (
          <button
            key={status}
            onClick={() => onUpdateStatus(status)}
            className={`px-3 py-1 rounded text-sm font-medium ${
              stakeholder.engagementStatus === status
                ? status === 'Not Contacted' ? 'bg-gray-600 text-white' :
                  status === 'Emailed' ? 'bg-blue-600 text-white' :
                  status === 'Responded' ? 'bg-green-600 text-white' :
                  'bg-purple-600 text-white'
                : getStatusColor(status)
            }`}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
};

// Add Stakeholder Modal
const AddStakeholderModal = ({ onClose, onSave }: {
  onClose: () => void;
  onSave: (stakeholder: Omit<Stakeholder, 'id' | 'engagementStatus'>) => void;
}) => {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = () => {
    if (!name.trim() || !title.trim()) {
      toast.error('Please enter name and title');
      return;
    }
    onSave({ name, title, email, phone });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <h3 className="text-xl font-bold mb-4">Add Stakeholder</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title / Role *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (Optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-2 border rounded-lg text-gray-900"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSubmit}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add Stakeholder
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Nurtures Tab
const NurturesTab = ({ nurtures, nurturesSent, onMarkNurtureSent }: {
  nurtures: Nurture[];
  nurturesSent: Record<number, string>;
  onMarkNurtureSent: (nurtureId: number) => void;
}) => {
  return (
    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
      {nurtures.map(nurture => {
        const sentDate = nurturesSent[nurture.id];
        return (
          <div key={nurture.id} className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!sentDate}
                  onChange={() => {
                    if (!sentDate) {
                      onMarkNurtureSent(nurture.id);
                    }
                  }}
                  className="w-5 h-5"
                />
                <div>
                  <h4 className="font-medium text-gray-900">{nurture.name}</h4>
                  {sentDate && (
                    <p className="text-xs text-gray-700 mt-1">
                      Sent: {new Date(sentDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {nurture.content && (
              <p className="text-sm text-gray-800 ml-8 whitespace-pre-wrap">{nurture.content}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Settings Modal
const SettingsModal = ({ nurtures, onClose, onAddNurture, onDeleteNurture }: {
  nurtures: Nurture[];
  onClose: () => void;
  onAddNurture: (nurture: { name: string; content: string }) => void;
  onDeleteNurture: (nurtureId: number) => void;
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error('Please enter an email name');
      return;
    }
    onAddNurture({ name, content });
    setName('');
    setContent('');
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b flex justify-between items-center">
          <h3 className="text-xl font-bold">Settings - Nurture Emails</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <button
            onClick={() => setShowAddForm(true)}
            className="mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={16} /> Add Nurture Email
          </button>

          {showAddForm && (
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2 border rounded-lg text-gray-900"
                    placeholder="e.g., Introduction Email"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Content/Template</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full p-2 border rounded-lg h-32"
                    placeholder="Paste email template or add notes/links here..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setName('');
                      setContent('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {nurtures.map(nurture => (
              <div key={nurture.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-medium text-gray-900">{nurture.name}</h4>
                  <button
                    onClick={() => onDeleteNurture(nurture.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {nurture.content && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{nurture.content}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Lost Confirm Modal
const LostConfirmModal = ({ onMoveToOnHold, onMarkLost, onCancel }: {
  onMoveToOnHold: () => void;
  onMarkLost: () => void;
  onCancel: () => void;
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Mark Deal as Lost?</h3>
        <p className="text-gray-800 mb-6">
          Would you like to move this deal to &quot;On Hold&quot; instead? You can nurture it and bring it back later.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onMoveToOnHold}
            className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
          >
            Move to On Hold
          </button>
          <button
            onClick={onMarkLost}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Mark as Lost
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default DealTracker;
