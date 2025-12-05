import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Trash2, Clock, CheckCircle, 
  AlertTriangle, Calendar, Settings, BarChart2, 
  Camera, Coffee, Play, X, 
  Trophy, Edit2, Check, List, FastForward, ChevronDown, ChevronUp, CalendarDays, Hourglass, AlertOctagon, Gift, Palette, BookOpen, TrendingUp, Zap
} from 'lucide-react';

// --- Types & Interfaces ---

type Repetition = 'once' | 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'specific_days';
type Priority = 'low' | 'medium' | 'high' | 'critical';
type Difficulty = 'easy' | 'medium' | 'hard';

interface Category {
  id: string;
  name: string;
  color: string;
  defaultRepetition: Repetition;
}

interface SubGoal {
  id: string;
  title: string;
  completed: boolean;
  difficulty?: Difficulty; 
  timing?: number;         
}

interface Goal {
  id: string;
  title: string;
  categoryId: string;
  difficulty: Difficulty;
  deadline: string; 
  priority: Priority;
  repetitionOverride?: Repetition;
  repeatSpecificDays?: number[]; 
  timing?: number; 
  fixedTime?: string; 
  fixedDate?: string; 
  subgoals: SubGoal[];
  completed: boolean;
  createdAt: number;
  lastCompletedAt?: number;
  wasStarted?: boolean; 
  snoozedUntil?: number; 
  deferredUntil?: number; 
  jackpotAwardedForCycle?: boolean;
  revisionCount?: number; 
  adaptiveStatus?: 'stable' | 'increased' | 'decreased'; 
}

interface TaskLog {
  id: string;
  goalId: string;
  subgoalId?: string;
  categoryId: string;
  action: 'completed' | 'skipped' | 'snoozed' | 'reward_start' | 'incomplete' | 'moved' | 'paused' | 'relapse' | 'habit_done';
  timestamp: number;
  hourOfDay: number; 
  duration?: number; 
  estimatedDuration?: number; 
  reason?: string;
  debtGenerated: number;
  gainGenerated: number;
  isJackpot?: boolean;
}

interface Habit {
  id: string;
  title: string;
  type: 'good' | 'bad'; 
  frequency: 'daily' | 'weekly'; 
  lastEvent: number; 
  createdAt: number;
}

interface RewardBlock {
  id: string;
  startTime: number; 
  endTime: number;   
  label: string;
  repetition: Repetition; 
  repeatSpecificDays?: number[]; 
}

interface UserData {
  categories: Category[];
  goals: Goal[];
habits: Habit[];
activeTaskStartTime: number | null;
  freeTimeUntil: number | null;
  todayScheduleOrder: { date: string, ids: string[] } | null; // <--- ADD THIS LINE
  notifiedTaskIds: string[];
  logs: TaskLog[];
  rewardBlocks: RewardBlock[]; 
  debt: number;
  gain: number;
  activeTaskId: string | null;
  activeTaskType: 'goal' | 'subgoal' | 'reward_block' | null; 
  activeTaskStartTime: number | null; 
  freeTimeUntil: number | null; 
  notifiedTaskIds: string[]; 
  lastNotificationDate: string; 
  settings: {
    workStartHour: number;
    workEndHour: number;
    peakStartHour: number; 
    peakEndHour: number;   
    allowNotifications: boolean;
darkMode: boolean;
    simulatedDay?: number;
    simulatedHour?: number; 
  };
}

interface ActiveTaskWrapper extends Partial<Goal>, Partial<SubGoal> {
  type: 'goal' | 'subgoal' | 'reward_block';
  parentId: string;
  originalGoal?: Goal | any; // Any allows for mock goal structure for rewards
  score?: number;
  daysUntilDeadline?: number;
  estimatedDuration: number;
  currentContextScore?: number;
  isResurrected?: boolean;
  isHobby?: boolean; 
  neglectScore?: number; 
  daysNeglected?: number; 
  isRevision?: boolean;
  revisionScore?: number;
  isAdaptive?: boolean;
}

interface ScheduleSlot {
  id: string;
  startTime: string; 
  endTime: string; 
  type: 'task' | 'break' | 'fixed' | 'free' | 'passed' | 'overlap' | 'reward_block' | 'ongoing'; 
  task?: ActiveTaskWrapper;
  reason?: string; 
  isFixed?: boolean;
}

// --- Constants & Helpers ---

const generateId = (existingIds?: Set<string>): string => {
  let id = '';
  do {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
  } while (existingIds && existingIds.has(id));
  return id;
};

const DIFFICULTY_SCORE = { easy: 10, medium: 20, hard: 35 };
const PRIORITY_WEIGHT = { low: 1, medium: 1.5, high: 2, critical: 3 };
const PRIORITY_LEAD_DAYS = { low: 1, medium: 2, high: 4, critical: 6 }; 

const RESURRECTION_BOOST = 200; 
const JACKPOT_BONUS = 1000;

const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOBBIES_CAT_ID = 'hobbies';
const REVISION_CAT_ID = 'revision';
const ADAPTIVE_CAT_ID = 'adaptive';
const REWARD_CAT_ID = 'reward';

const INITIAL_DATA: UserData = {
  categories: [
    { id: 'cat_work', name: 'Work', color: '#3b82f6', defaultRepetition: 'weekdays' },
    { id: 'cat_health', name: 'Health', color: '#10b981', defaultRepetition: 'daily' },
    { id: 'cat_learn', name: 'Learning', color: '#8b5cf6', defaultRepetition: 'weekly' },
    { id: HOBBIES_CAT_ID, name: 'Hobbies 🎨', color: '#ec4899', defaultRepetition: 'weekly' }, 
    { id: REVISION_CAT_ID, name: 'Revision 📚', color: '#6b7280', defaultRepetition: 'weekly' },
    { id: ADAPTIVE_CAT_ID, name: 'Adaptive ⚡', color: '#f59e0b', defaultRepetition: 'daily' },
  ],
  goals: [],
habits: [],
  logs: [],
  rewardBlocks: [],
  debt: 0,
  gain: 0,
  activeTaskId: null,
  activeTaskType: null,
  activeTaskStartTime: null,
  freeTimeUntil: null,
todayScheduleOrder: null,
  notifiedTaskIds: [],
  lastNotificationDate: new Date().toISOString().split('T')[0],
  settings: {
    workStartHour: 6, 
    workEndHour: 21,
    peakStartHour: 9, 
    peakEndHour: 12,  
    allowNotifications: false,
darkMode: false,
    simulatedDay: undefined,
    simulatedHour: undefined
  },
};

// Data Sanitization & Migration Helper
const sanitizeUserData = (data: any): UserData => {
  const existingIds = new Set<string>();
  const idMap = new Map<string, string>();

  const ensureUniqueId = (oldId: string | undefined): string => {
    if (oldId && !existingIds.has(oldId)) {
      existingIds.add(oldId);
      return oldId;
    }
    const newId = generateId(existingIds);
    if (oldId) idMap.set(oldId, newId);
    existingIds.add(newId);
    return newId;
  };

  let categories = Array.isArray(data?.categories) ? data.categories : INITIAL_DATA.categories;
  
  INITIAL_DATA.categories.forEach(defCat => {
      if (!categories.find((c: any) => c.id === defCat.id)) {
          categories.push(defCat);
      }
  });

  const goals = Array.isArray(data?.goals) ? data.goals.map((g: any) => {
    const newId = ensureUniqueId(g.id);
    let subgoals = Array.isArray(g.subgoals) ? g.subgoals.map((sg: any) => ({
        ...sg,
        id: ensureUniqueId(sg.id)
    })) : [];

    return {
      ...g,
      id: newId,
      subgoals,
      difficulty: g.difficulty || 'medium',
      priority: g.priority || 'medium',
      categoryId: g.categoryId || '',
      title: g.title || 'Untitled Goal',
      completed: !!g.completed,
      jackpotAwardedForCycle: !!g.jackpotAwardedForCycle,
      revisionCount: typeof g.revisionCount === 'number' ? g.revisionCount : 0,
      adaptiveStatus: g.adaptiveStatus || 'stable'
    };
  }) : [];

  const logs = Array.isArray(data?.logs) ? data.logs.map((l: any) => ({
    ...l,
    goalId: idMap.get(l.goalId) || l.goalId,
    subgoalId: idMap.get(l.subgoalId) || l.subgoalId
  })) : [];

const habits = Array.isArray(data?.habits) ? data.habits.map((h: any) => ({
      ...h,
      id: ensureUniqueId(h.id),
      type: h.type || 'bad', 
      frequency: h.frequency || 'daily',
      lastEvent: h.lastEvent || h.lastRelapse || Date.now(),
      createdAt: h.createdAt || Date.now()
  })) : (Array.isArray(data?.badHabits) ? data.badHabits.map((h: any) => ({ 
      id: ensureUniqueId(h.id),
      title: h.title,
      type: 'bad',
      frequency: 'daily',
      lastEvent: h.lastRelapse || Date.now(),
      createdAt: h.createdAt || Date.now()
  })) : []);

  const rewardBlocks = Array.isArray(data?.rewardBlocks) ? data.rewardBlocks.map((b: any) => ({
      ...b,
      id: ensureUniqueId(b.id),
      repetition: b.repetition || 'once',
      repeatSpecificDays: Array.isArray(b.repeatSpecificDays) ? b.repeatSpecificDays : []
  })) : [];

  return {
    categories,
    goals,
habits,
    logs,
    rewardBlocks,
    debt: typeof data?.debt === 'number' ? data.debt : 0,
    gain: typeof data?.gain === 'number' ? data.gain : 0,
    activeTaskId: idMap.get(data?.activeTaskId) || data?.activeTaskId || null,
    activeTaskType: data?.activeTaskType || null,
    activeTaskStartTime: data?.activeTaskStartTime || null,
    freeTimeUntil: data?.freeTimeUntil || null,
todayScheduleOrder: data?.todayScheduleOrder || null,
    notifiedTaskIds: Array.isArray(data?.notifiedTaskIds) ? data.notifiedTaskIds : [],
    lastNotificationDate: data?.lastNotificationDate || new Date().toISOString().split('T')[0],
    settings: { ...INITIAL_DATA.settings, ...(data?.settings || {}) }
  };
};

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
};

const parseTimeStr = (timeStr: string): string => {
  if (!timeStr) return '';
  const lower = timeStr.toLowerCase().trim();
  let h = 0, m = 0;

  if (lower.includes('pm') || lower.includes('am')) {
    const isPM = lower.includes('pm');
    const isAM = lower.includes('am');
    const parts = lower.replace(/[a-z]/g, '').trim().split(':');
    h = parseInt(parts[0] || '0');
    m = parseInt(parts[1] || '0');

    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
  } else if (lower.includes(':')) {
    const parts = lower.split(':');
    h = parseInt(parts[0]);
    m = parseInt(parts[1]);
  } else {
      if (!isNaN(Number(lower))) {
          if(lower.length <= 2) h = parseInt(lower);
          else {
             h = parseInt(lower.substring(0, lower.length - 2));
             m = parseInt(lower.substring(lower.length - 2));
          }
      }
  }
  if (isNaN(h) || h < 0 || h > 23) return '';
  if (isNaN(m) || m < 0 || m > 59) return '';
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const parseDateStr = (dateStr: string): string => {
  if (!dateStr) return '';
  let isoDate = dateStr;
  if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
    const [d, m, y] = dateStr.split('-');
    isoDate = `${y}-${m}-${d}`;
  } else if (dateStr.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
     isoDate = dateStr.replace(/\//g, '-');
  }
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return ''; 
  return isoDate;
};

// --- ADVANCED ALGORITHM HELPERS ---

const calculateVelocity = (logs: TaskLog[], categoryId: string): number => {
  const catLogs = logs.filter(l => l.categoryId === categoryId && l.action === 'completed' && l.duration && l.estimatedDuration);
  if (catLogs.length < 3) return 1; 
  let totalRatio = 0;
  catLogs.forEach(l => {
    if (l.estimatedDuration && l.estimatedDuration > 0) {
        totalRatio += (l.duration! / l.estimatedDuration);
    }
  });
  const avgVelocity = totalRatio / catLogs.length;
  return Math.min(Math.max(avgVelocity, 0.5), 2.0);
};

const getStressScore = (deadline: Date, targetDate: Date): number => {
  const d = new Date(deadline); d.setHours(0,0,0,0);
  const t = new Date(targetDate); t.setHours(0,0,0,0);
  const diffMs = d.getTime() - t.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 150; 
  if (diffDays === 0) return 100; 
  return Math.max(0, 100 / (diffDays + 1));
};

const calculateRevisionScore = (goal: Goal, targetDate: Date, lastCompletedAt: number | undefined): number => {
    if (!lastCompletedAt) return 100; 
    const daysSince = (targetDate.getTime() - lastCompletedAt) / (1000 * 60 * 60 * 24);
    const safeCount = goal.revisionCount ?? 0;
    const interval = Math.pow(2, safeCount); 
    return daysSince / interval;
};

const tuneAdaptiveHabit = (goal: Goal, logs: TaskLog[]): { repetition: Repetition, status: 'stable'|'increased'|'decreased' } => {
    const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(l => l.goalId === goal.id && l.timestamp > twoWeeksAgo);
    const completions = recentLogs.filter(l => l.action === 'completed').length;
    
    let expected = 0;
    if (goal.repetitionOverride === 'daily') expected = 14;
    else if (goal.repetitionOverride === 'weekly') expected = 2;
    else expected = 5; 

    const safeExpected = Math.max(expected, 1);
    const rate = completions / safeExpected;
    
    if (rate < 0.6) return { repetition: 'daily', status: 'increased' }; 
    if (rate > 0.9 && goal.repetitionOverride === 'daily') return { repetition: 'weekly', status: 'decreased' }; 
    
    return { repetition: goal.repetitionOverride || 'daily', status: 'stable' };
};

const selectDailyHobby = (logs: TaskLog[], goals: Goal[], targetDate: Date, simulatedCompletedIds: Set<string>): { hobby: ActiveTaskWrapper, status: 'selected' | 'rest' } => {
  const MAX_WEEKLY_SLOTS = 2; 
  const oneWeekAgo = targetDate.getTime() - (7 * 24 * 60 * 60 * 1000);
  
  const hobbies = goals.filter(g => g.categoryId === HOBBIES_CAT_ID && !g.completed && !simulatedCompletedIds.has(g.id));
  
  if (hobbies.length === 0) return { hobby: null as any, status: 'rest' };

  const scoredHobbies = hobbies.map(hobby => {
     const recentLogs = logs.filter(l => l.goalId === hobby.id && l.action === 'completed' && l.timestamp > oneWeekAgo);
     const simCount = Array.from(simulatedCompletedIds).filter(id => id === hobby.id).length;
     const weeklyCount = recentLogs.length + simCount;

     if (weeklyCount >= MAX_WEEKLY_SLOTS) return null;

     const allLogs = logs.filter(l => l.goalId === hobby.id && l.action === 'completed').sort((a,b) => b.timestamp - a.timestamp);
     const lastLog = allLogs[0];
     
     const rawDays = lastLog ? (targetDate.getTime() - lastLog.timestamp) / (1000 * 60 * 60 * 24) : 28;
     const daysSince = Math.min(rawDays, 28);

     const weeklyRate = Math.min(weeklyCount / 5, 1); 
     
     const neglectScore = (daysSince / 28) * (1 - weeklyRate);
     
     return { hobby, neglectScore, daysSince };
  }).filter(Boolean);

  if (scoredHobbies.length === 0) return { hobby: null as any, status: 'rest' };

  scoredHobbies.sort((a,b) => (b!.neglectScore) - (a!.neglectScore));
  const winner = scoredHobbies[0]!;

  const wrapper: ActiveTaskWrapper = {
     type: 'goal',
     id: winner.hobby.id,
     parentId: winner.hobby.id,
     originalGoal: winner.hobby,
     title: winner.hobby.title,
     estimatedDuration: winner.hobby.timing || 45,
     difficulty: winner.hobby.difficulty,
     score: 0, 
     isHobby: true,
     neglectScore: winner.neglectScore,
     daysNeglected: Math.floor(winner.daysSince)
  };

  return { hobby: wrapper, status: 'selected' };
};

// --- CORE SCHEDULER (Static Today + Dynamic Week + Habitica Mode) ---
const generateScheduleForDate = (
  targetDate: Date, 
  data: UserData, 
  tendencies: { time: Record<string, number>, day: Record<string, number[]>, resistance: Record<string, number[]> },
  startTimeOverride?: Date,
  simulatedCompletedIds: Set<string> = new Set(),
  frozenOrder: string[] | null = null // <--- NEW ARGUMENT
): { schedule: ScheduleSlot[], completedIds: string[], hobbyStatus: 'none' | 'selected' | 'rest' } => {
  
  let schedule: ScheduleSlot[] = [];
  const todayDay = targetDate.getDay();
  const todayStr = targetDate.toISOString().split('T')[0];
  const dayStart = new Date(targetDate); dayStart.setHours(0,0,0,0);
  const dayEnd = new Date(targetDate); dayEnd.setHours(23,59,59,999);

  // 1. Setup Work Hours
  const workStart = new Date(targetDate);
  workStart.setHours(data.settings.workStartHour, 0, 0, 0);
  const workEnd = new Date(targetDate);
  if (data.settings.workEndHour < data.settings.workStartHour) workEnd.setDate(workEnd.getDate() + 1);
  workEnd.setHours(data.settings.workEndHour, 0, 0, 0);

  // 2. Setup Simulation Time
  let simulationTime = new Date(targetDate);
  let viewStartTime = new Date(targetDate); 

  if (startTimeOverride) {
    simulationTime = new Date(startTimeOverride);
    viewStartTime = new Date(startTimeOverride);
  } else {
    const isToday = new Date().toDateString() === targetDate.toDateString();
    if (isToday) {
       if (data.settings.simulatedHour !== undefined) {
         simulationTime.setHours(data.settings.simulatedHour, 0, 0, 0);
         viewStartTime.setHours(data.settings.simulatedHour, 0, 0, 0);
       } else {
         // HABITICA FIX: Always start schedule from Work Start
         // This ensures tasks don't disappear if you open the app at 5PM
         simulationTime = new Date(workStart);
         viewStartTime = new Date(workStart);
       }
       if (data.freeTimeUntil && data.freeTimeUntil > simulationTime.getTime() && data.settings.simulatedHour === undefined) {
         simulationTime = new Date(data.freeTimeUntil);
       }
    } else {
       simulationTime = new Date(workStart);
       viewStartTime = new Date(workStart);
    }
  }

  // Handle late-night start times relative to work hours
  if (simulationTime.getHours() >= 0 && simulationTime.getHours() < data.settings.workStartHour) {
     if (data.settings.workEndHour >= data.settings.workStartHour) {
        workEnd.setDate(workEnd.getDate() + 1);
        workEnd.setHours(3, 0, 0, 0); 
     }
  } else if (data.settings.workEndHour < data.settings.workStartHour) {
      workEnd.setDate(workEnd.getDate() + 1);
  }
  if (simulationTime < workStart) {
      simulationTime = new Date(workStart);
      viewStartTime = new Date(workStart);
  }

  // 3. Pre-calculate Weekly Balance Stats
  const weeklyStats: Record<string, number> = {};
  const oneWeekAgoMs = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
  data.logs.forEach(l => {
      if (l.timestamp > oneWeekAgoMs && (l.action === 'completed' || l.action === 'habit_done')) {
          weeklyStats[l.categoryId] = (weeklyStats[l.categoryId] || 0) + (l.duration || l.estimatedDuration || 0);
      }
  });
  const totalWeeklyMins = Object.values(weeklyStats).reduce((a, b) => a + b, 0) || 1;

  // 4. Build Pools
  const categoryVelocities: Record<string, number> = {};
  data.categories.forEach(c => categoryVelocities[c.id] = calculateVelocity(data.logs, c.id));

  let flexiblePool: ActiveTaskWrapper[] = [];
  let fixedPool: ActiveTaskWrapper[] = [];

  // Add Rewards
  (data.rewardBlocks || []).forEach(block => {
     const wasSkipped = data.logs.some(l => l.goalId === block.id && l.action === 'skipped' && new Date(l.timestamp).toDateString() === targetDate.toDateString());
     if (wasSkipped) return;
     if (block.startTime < dayEnd.getTime() && block.endTime > dayStart.getTime()) {
        const effectiveStart = Math.max(block.startTime, dayStart.getTime());
        let shouldSchedule = false;
        if (block.repetition === 'once' || !block.repetition) shouldSchedule = true;
        else {
            const bStart = new Date(block.startTime);
            if (block.repetition === 'daily') shouldSchedule = true;
            if (block.repetition === 'weekdays' && todayDay >= 1 && todayDay <= 5) shouldSchedule = true;
            if (block.repetition === 'weekends' && (todayDay === 0 || todayDay === 6)) shouldSchedule = true;
            if (block.repetition === 'weekly' && bStart.getDay() === todayDay) shouldSchedule = true;
            if (block.repetition === 'specific_days' && block.repeatSpecificDays?.includes(todayDay)) shouldSchedule = true;
        }
        if (shouldSchedule) {
            const s = new Date(effectiveStart);
            if (block.repetition && block.repetition !== 'once') {
                 const origStart = new Date(block.startTime);
                 s.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
            }
            const durationMins = (block.endTime - block.startTime) / 60000;
            fixedPool.push({ type: 'reward_block', id: block.id, parentId: block.id, title: block.label, fixedTime: `${s.getHours().toString().padStart(2,'0')}:${s.getMinutes().toString().padStart(2,'0')}`, estimatedDuration: durationMins, difficulty: 'easy', originalGoal: { categoryId: REWARD_CAT_ID, ...block } as any });
        }
     }
  });

  // Add Goals
  (Array.isArray(data.goals) ? data.goals : []).forEach(goal => {
    if (!goal || goal.completed || simulatedCompletedIds.has(goal.id) || goal.categoryId === HOBBIES_CAT_ID) return;

    let effectiveRepetition = goal.repetitionOverride || (data.categories || []).find(c => c.id === goal.categoryId)?.defaultRepetition || 'once';
    let adaptiveBoost = 0;
    let isAdaptive = false;
    let revisionScore = 0;
    let isRevision = false;

    if (goal.categoryId === ADAPTIVE_CAT_ID) {
        isAdaptive = true;
        const tuning = tuneAdaptiveHabit(goal, data.logs);
        effectiveRepetition = tuning.repetition;
        adaptiveBoost = 20; 
    }
    if (goal.categoryId === REVISION_CAT_ID) {
        isRevision = true;
        revisionScore = calculateRevisionScore(goal, targetDate, goal.lastCompletedAt);
        if (revisionScore <= 1.5) return;
    }
    if (goal.snoozedUntil && goal.snoozedUntil > new Date().getTime() && data.settings.simulatedHour === undefined) return;
    if (goal.deferredUntil) {
       const targetEndLimit = new Date(targetDate); targetEndLimit.setHours(23, 59, 59, 999);
       if (goal.deferredUntil > targetEndLimit.getTime()) return; 
    }
    if (goal.lastCompletedAt && !isRevision) { 
      const last = new Date(goal.lastCompletedAt);
      if (last.toDateString() === targetDate.toDateString()) { 
         if (!goal.fixedDate && effectiveRepetition !== 'once') return; 
      }
      if (effectiveRepetition === 'weekly') {
         if (Math.ceil(Math.abs(targetDate.getTime() - last.getTime()) / (86400000)) < 7) return;
      }
    }
    if (goal.fixedDate && goal.fixedDate !== todayStr) return;
    if (!goal.fixedDate && !isRevision) {
       if (effectiveRepetition === 'weekdays' && (todayDay === 0 || todayDay === 6)) return;
       if (effectiveRepetition === 'weekends' && (todayDay !== 0 && todayDay !== 6)) return;
       if (effectiveRepetition === 'specific_days' && goal.repeatSpecificDays && !goal.repeatSpecificDays.includes(todayDay)) return;
    }

    const subgoals = Array.isArray(goal.subgoals) ? goal.subgoals : [];
    let firstIncompleteSubgoal: SubGoal | null = null;
    for (const sg of subgoals) { if (!sg.completed && !simulatedCompletedIds.has(sg.id)) { firstIncompleteSubgoal = sg; break; } }
    if (subgoals.length > 0 && !firstIncompleteSubgoal) return;

    const items = firstIncompleteSubgoal ? [firstIncompleteSubgoal] : (subgoals.length === 0 ? [goal] : []);
    items.forEach((item) => {
      const deadline = new Date(goal.deadline);
      const effectiveDeadline = new Date(deadline);
      effectiveDeadline.setDate(effectiveDeadline.getDate() - PRIORITY_LEAD_DAYS[goal.priority || 'medium']);
      
      if (!goal.fixedTime && !goal.fixedDate) {
          if (goal.priority !== 'critical' && ((effectiveDeadline.getTime() - targetDate.getTime()) / 86400000) > 14 && !isRevision && !isAdaptive) return;
      }
      
      let urgencyScore = PRIORITY_WEIGHT[goal.priority || 'medium'] * 20;
      if (((new Date().getTime() - goal.createdAt) > 86400000 && !goal.wasStarted) || goal.wasStarted) urgencyScore += RESURRECTION_BOOST;
      urgencyScore += getStressScore(effectiveDeadline, targetDate);
      urgencyScore += adaptiveBoost; 
      if (isRevision) urgencyScore = 40 + Math.min(revisionScore * 20, 100);

      let baseDuration = (('timing' in item && typeof item.timing === 'number') ? item.timing : (goal.timing || 60));
      if (!('timing' in item) && subgoals.length > 0) baseDuration = Math.ceil((goal.timing || 60) / subgoals.length);
      
      const adaptiveDuration = Math.ceil(baseDuration * (categoryVelocities[goal.categoryId] || 1));
      const diff = ('difficulty' in item && item.difficulty) ? item.difficulty : goal.difficulty;
      
      const taskObj: ActiveTaskWrapper = {
        type: firstIncompleteSubgoal ? 'subgoal' : 'goal', id: item.id, parentId: goal.id, originalGoal: goal,
        title: firstIncompleteSubgoal ? `${goal.title}: ${(item as SubGoal).title}` : goal.title,
        score: urgencyScore, daysUntilDeadline: (deadline.getTime() - targetDate.getTime()) / 86400000,
        estimatedDuration: adaptiveDuration, difficulty: diff || 'medium', fixedTime: goal.fixedTime,
        currentContextScore: 0, isResurrected: goal.wasStarted, isRevision, isAdaptive
      };
      if (goal.fixedTime) fixedPool.push(taskObj); else flexiblePool.push(taskObj);
    });
  });

  // Inject Hobby
  const hobbyResult = selectDailyHobby(data.logs, Array.isArray(data.goals) ? data.goals : [], targetDate, simulatedCompletedIds);
  if (hobbyResult.status === 'selected' && hobbyResult.hobby) flexiblePool.push(hobbyResult.hobby);
  const hobbyStatus = hobbyResult.status;

  fixedPool.sort((a, b) => {
      if (!a.fixedTime) return 1; if (!b.fixedTime) return -1;
      return parseTimeStr(a.fixedTime!).localeCompare(parseTimeStr(b.fixedTime!));
  });

  let fixedLoad = 0; fixedPool.forEach(t => fixedLoad += t.estimatedDuration);
  const maxFlexibleLoad = Math.max(0, ((workEnd.getTime() - workStart.getTime()) / 60000) - fixedLoad);
  let currentFlexibleLoad = 0;
  flexiblePool = flexiblePool.filter(task => {
    if ((task.daysUntilDeadline || 0) < 3 || task.originalGoal?.priority === 'critical' || task.isHobby || task.isRevision || task.isAdaptive) return true;
    if (currentFlexibleLoad + task.estimatedDuration <= maxFlexibleLoad) { currentFlexibleLoad += task.estimatedDuration; return true; }
    return false;
  });

  // --- AUTOMATED BALANCING + SCORING ---
  let accumulatedStrain = 0; 
  let lastCategoryId = '';
  let consecutiveCategoryCount = 0;

  const fillGap = (endTimeLimit: Date) => {
    while (simulationTime < endTimeLimit) {
      const minsRemaining = Math.floor((endTimeLimit.getTime() - simulationTime.getTime()) / 60000);
      const minThreshold = flexiblePool.some(t => t.estimatedDuration <= 10) ? 5 : 10;
      if (minsRemaining < minThreshold && flexiblePool.every(t => t.estimatedDuration > minsRemaining)) break;

      // STRAIN CHECK
      if (accumulatedStrain > 45) { 
         const breakEnd = new Date(simulationTime.getTime() + 15 * 60000);
         if (breakEnd > endTimeLimit) break;
         schedule.push({ id: `strain-break-${simulationTime.getTime()}`, startTime: formatTime(simulationTime), endTime: formatTime(breakEnd), type: 'break', reason: "Brain Reset" });
         simulationTime = breakEnd; accumulatedStrain = 0; consecutiveCategoryCount = 0; continue;
      }

      const currentHour = simulationTime.getHours();
      const logicalHour = currentHour < data.settings.workStartHour ? currentHour + 24 : currentHour;
      
      // SCORING
      flexiblePool.forEach(task => {
        let contextScore = task.score || 0;
        const catId = task.originalGoal?.categoryId || '';
        
        // 1. Weekly Balance
        const weeklyShare = (weeklyStats[catId] || 0) / totalWeeklyMins;
        if (weeklyShare > 0.4) contextScore -= 20; 
        if (weeklyShare < 0.1) contextScore += 20; 

        // 2. Daily Rhythm
        if (catId === lastCategoryId) {
            if (consecutiveCategoryCount < 2) contextScore += 10; 
            else contextScore -= 50; 
        } else contextScore += 5; 

        // 3. Strain
        if (accumulatedStrain > 25) {
            if (task.difficulty === 'hard') contextScore -= 100; 
            if (task.difficulty === 'easy') contextScore += 50;
            if (task.isHobby) contextScore += 80;
        }

        // 4. Standard
        if (task.isHobby) {
             contextScore += 75; 
             const resistanceArr = tendencies.resistance[catId];
             if (resistanceArr && logicalHour < resistanceArr.length && resistanceArr[logicalHour] > 0) contextScore -= 20;
        } else {
             if (logicalHour >= data.settings.peakStartHour && logicalHour < data.settings.peakEndHour) {
                if (task.difficulty === 'hard') contextScore += 25;
                else if (task.difficulty === 'easy') contextScore -= 10;
             } else {
                if (task.difficulty === 'hard') contextScore -= 20;
             }
             let preferredHour = tendencies.time[catId];
             if (preferredHour !== undefined && preferredHour < data.settings.workStartHour) preferredHour += 24;
             if (preferredHour !== undefined && Math.abs(logicalHour - preferredHour) <= 2) contextScore += 15;
        }
        task.currentContextScore = contextScore;
      });
      
      // --- FROZEN vs DYNAMIC SORT ---
      if (frozenOrder && frozenOrder.length > 0) {
          const frozenTasks: ActiveTaskWrapper[] = [];
          const newTasks: ActiveTaskWrapper[] = [];
          const poolMap = new Map(flexiblePool.map(t => [t.id, t]));
          
          frozenOrder.forEach(id => {
              if (poolMap.has(id)) { frozenTasks.push(poolMap.get(id)!); poolMap.delete(id); }
          });
          poolMap.forEach(task => {
              // High Priority cuts line
              if (task.originalGoal?.priority === 'critical' || task.originalGoal?.priority === 'high') newTasks.push(task);
              else frozenTasks.push(task); 
          });
          newTasks.sort((a, b) => (b.score || 0) - (a.score || 0));
          flexiblePool = [...newTasks, ...frozenTasks];
      } else {
          flexiblePool.sort((a, b) => (b.currentContextScore || 0) - (a.currentContextScore || 0));
      }

      let selectedTaskIndex = flexiblePool.findIndex(t => t.estimatedDuration <= minsRemaining);
      if (selectedTaskIndex === -1) break;
      const bestTask = flexiblePool[selectedTaskIndex];
      const taskEnd = new Date(simulationTime.getTime() + bestTask.estimatedDuration * 60000);
      schedule.push({ id: bestTask.id!, startTime: formatTime(simulationTime), endTime: formatTime(taskEnd), type: 'task', task: bestTask });
      completedInThisRun.push(bestTask.id!);

      flexiblePool.splice(selectedTaskIndex, 1); 
      simulationTime = taskEnd;
      
      if (bestTask.originalGoal?.categoryId === lastCategoryId) consecutiveCategoryCount++;
      else { lastCategoryId = bestTask.originalGoal?.categoryId || ''; consecutiveCategoryCount = 1; }
      
      const strainMap = { hard: 20, medium: 10, easy: 5 };
      accumulatedStrain += strainMap[bestTask.difficulty as 'hard'|'medium'|'easy'] || 10;
    }
  };

  for (const fixedTask of fixedPool) {
    if (!fixedTask.fixedTime) continue;
    const cleanFixedTime = parseTimeStr(fixedTask.fixedTime);
    if (!cleanFixedTime.includes(':')) continue;
    const [h, m] = cleanFixedTime.split(':').map(Number);
    const fixedStart = new Date(targetDate); fixedStart.setHours(h, m, 0, 0);
    const fixedEnd = new Date(fixedStart.getTime() + fixedTask.estimatedDuration * 60000);
    
    const isOngoing = fixedStart.getTime() < simulationTime.getTime() && fixedEnd.getTime() > simulationTime.getTime();
    if (fixedStart < simulationTime && !isOngoing) {
        if (fixedStart < viewStartTime) schedule.push({ id: fixedTask.id!, startTime: formatTime(fixedStart), endTime: formatTime(fixedEnd), type: fixedTask.type === 'reward_block' ? 'reward_block' : 'passed', task: fixedTask, isFixed: true });
        else {
             schedule.push({ id: fixedTask.id!, startTime: formatTime(fixedStart), endTime: formatTime(fixedEnd), type: fixedTask.type === 'reward_block' ? 'reward_block' : 'overlap', task: fixedTask, isFixed: true });
             if (fixedEnd > simulationTime) { simulationTime = fixedEnd; accumulatedStrain = 0; }
        }
        continue;
    }
    if (isOngoing) {
         schedule.push({ id: fixedTask.id!, startTime: formatTime(fixedStart), endTime: formatTime(fixedEnd), type: fixedTask.type === 'reward_block' ? 'reward_block' : 'ongoing', task: fixedTask, isFixed: true });
         simulationTime = fixedEnd; accumulatedStrain = 0; continue;
    }
    if (fixedStart > simulationTime) { fillGap(fixedStart); if (simulationTime < fixedStart) simulationTime = fixedStart; }

    schedule.push({ id: fixedTask.id!, startTime: formatTime(simulationTime), endTime: formatTime(fixedEnd), type: fixedTask.type === 'reward_block' ? 'reward_block' : 'fixed', task: fixedTask, isFixed: true });
    simulationTime = fixedEnd; accumulatedStrain = 0;
  }
  fillGap(workEnd); 
  return { schedule, completedIds: completedInThisRun, hobbyStatus: hobbyStatus as 'none' | 'selected' | 'rest' };
};

// --- Sub Component: CategoryBadge ---
function CategoryBadge({ catId, data }: { catId: string, data: UserData }) { 
    // FIX: Add explicit Reward visual tag
    if (catId === REWARD_CAT_ID) {
        return <span className="px-2 py-0.5 rounded text-xs text-white font-medium bg-purple-500">🎁 Reward</span>;
    }
    const cat = (data.categories || []).find(c => c.id === catId); 
    if (!cat) return <span className="text-gray-500 text-xs">Uncategorized</span>; 
    return <span className="px-2 py-0.5 rounded text-xs text-white font-medium" style={{ backgroundColor: cat.color }}>{cat.name}</span>; 
}

export default function TimeFlowApp() {
  const [data, setData] = useState<UserData>(INITIAL_DATA);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'goals' | 'categories' | 'stats' | 'settings' | 'habits'>('dashboard');
  const [dashboardView, setDashboardView] = useState<'daily' | 'weekly'>('daily');
  const [rewardMode, setRewardMode] = useState<boolean>(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [jackpotTriggered, setJackpotTriggered] = useState(false);
  const [justCompleted, setJustCompleted] = useState<any | null>(null);
  
  const [expandedDay, setExpandedDay] = useState<number | null>(null); 
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  
  const [showRewardInput, setShowRewardInput] = useState(false);
  const [rewardReason, setRewardReason] = useState('');
  const [completionType, setCompletionType] = useState<'complete' | 'incomplete' | null>(null);
  


  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (data.activeTaskId) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [data.activeTaskId]);

  useEffect(() => {
    const saved = localStorage.getItem('timeflow_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized = sanitizeUserData(parsed);
        setData(sanitized);
      } catch (e) {
        console.error("Failed to parse saved data, resetting to default.", e);
        setData(INITIAL_DATA);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('timeflow_data', JSON.stringify(data));
  }, [data]);

  const categoryTendencies = useMemo(() => {
    const tendencies: Record<string, number> = {}; 
    const counts: Record<string, number> = {};
    const dayTendencies: Record<string, number[]> = {}; 
    const resistance: Record<string, number[]> = {};

    (data.logs || []).forEach(log => {
      let hour = log.hourOfDay;
      if (hour < data.settings.workStartHour) hour += 24;

      if (log.action === 'completed' || log.action === 'moved') {
        if (!tendencies[log.categoryId]) { tendencies[log.categoryId] = 0; counts[log.categoryId] = 0; }
        tendencies[log.categoryId] += hour;
        counts[log.categoryId]++;

        if (!dayTendencies[log.categoryId]) { dayTendencies[log.categoryId] = [0, 0, 0, 0, 0, 0, 0]; }
        const dayIndex = new Date(log.timestamp).getDay();
        dayTendencies[log.categoryId][dayIndex]++;
      } else if (log.action === 'skipped' || log.action === 'snoozed') {
        if (!resistance[log.categoryId]) { resistance[log.categoryId] = new Array(30).fill(0); }
        if (hour < 30 && resistance[log.categoryId]) resistance[log.categoryId][hour]++;
      }
    });

    Object.keys(tendencies).forEach(catId => {
      if (counts[catId] > 0) tendencies[catId] = tendencies[catId] / counts[catId];
    });
    return { time: tendencies, day: dayTendencies, resistance };
  }, [data.logs, data.settings.workStartHour]);

const dailyData = useMemo(() => {
    const now = new Date();
    if (now.getHours() < data.settings.workStartHour) {
      now.setDate(now.getDate() - 1);
    }
    if (data.settings.simulatedDay !== undefined) {
      const currentDay = now.getDay();
      const diff = data.settings.simulatedDay - currentDay;
      now.setDate(now.getDate() + diff);
    }
    
    // LOAD FROZEN ORDER
    const todayStr = now.toISOString().split('T')[0];
    const frozenOrder = (data.todayScheduleOrder && data.todayScheduleOrder.date === todayStr) 
        ? data.todayScheduleOrder.ids 
        : null;

    return generateScheduleForDate(now, data, categoryTendencies, undefined, undefined, frozenOrder);
  }, [data.goals, data.logs, data.settings, categoryTendencies, data.freeTimeUntil, data.categories, data.rewardBlocks, data.todayScheduleOrder]);

  // SAVE FROZEN ORDER (Effect)
  useEffect(() => {
    if (dailySchedule.length > 0) {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        if (!data.todayScheduleOrder || data.todayScheduleOrder.date !== todayStr) {
            const ids = dailySchedule.map(s => s.task?.id).filter(Boolean) as string[];
            if (ids.length > 0) {
                setData(prev => ({ ...prev, todayScheduleOrder: { date: todayStr, ids } }));
            }
        }
    }
  }, [dailySchedule, data.todayScheduleOrder]);

  const dailySchedule = dailyData.schedule;
  const dailyHobbyStatus = dailyData.hobbyStatus;
// --- DARK MODE SYSTEM ---
  useEffect(() => {
    if (data.settings.darkMode) {
      document.documentElement.classList.add('dark');
      const style = document.createElement('style');
      style.id = 'dark-mode-styles';
      style.innerHTML = `
        /* --- BASICS --- */
        .dark body { background-color: #000000 !important; }
        .dark .bg-white { background-color: #111827 !important; color: #e5e7eb !important; border-color: #374151 !important; }
        .dark .bg-gray-50, .dark .bg-gray-100 { background-color: #1f2937 !important; border-color: #374151 !important; }
        
        /* --- TEXT --- */
        .dark .text-gray-900 { color: #f9fafb !important; }
        .dark .text-gray-800, .dark .text-gray-700 { color: #e5e7eb !important; }
        .dark .text-gray-600, .dark .text-gray-500 { color: #9ca3af !important; }
        .dark .text-gray-400 { color: #6b7280 !important; }
        
        /* --- INTERACTIVE ELEMENTS --- */
        .dark input, .dark select, .dark textarea { background-color: #374151 !important; color: white !important; border-color: #4b5563 !important; }
        .dark .shadow-sm, .dark .shadow-xl { box-shadow: none !important; }
        
        /* Fix: Weekly Roadmap Hover State */
        .dark .hover\\:bg-gray-50:hover { background-color: #374151 !important; }
        .dark .hover\\:bg-blue-50:hover { background-color: #1e3a8a !important; }

        /* --- COLORED CARDS & BADGES OVERRIDES --- */

        /* PURPLE (Reward Mode, Fixed Time Badge, Reward Schedule) */
        .dark .bg-purple-50 { background-color: #581c87 !important; border-color: #6b21a8 !important; }
        .dark .bg-purple-100 { background-color: #4c1d95 !important; color: #e9d5ff !important; } /* <--- Fixes Fixed Time Badge */
        .dark .text-purple-600, .dark .text-purple-700, .dark .text-purple-800, .dark .text-purple-900 { color: #d8b4fe !important; }

        /* GREEN (Gain, Ongoing Badge, Success) */
        .dark .bg-green-50 { background-color: #064e3b !important; border-color: #065f46 !important; }
        .dark .bg-green-100 { background-color: #14532d !important; color: #dcfce7 !important; } /* <--- Fixes Ongoing Badge */
        .dark .text-green-600, .dark .text-green-700, .dark .text-green-800 { color: #6ee7b7 !important; }

        /* ORANGE (Developer Mode, Overlap Badge) */
        .dark .bg-orange-50 { background-color: #451a03 !important; border-color: #78350f !important; }
        .dark .bg-orange-100 { background-color: #7c2d12 !important; color: #ffedd5 !important; } /* <--- Fixes Overlap Badge */
        .dark .text-orange-600, .dark .text-orange-800 { color: #fdba74 !important; }

        /* RED (Debt) */
        .dark .bg-red-50 { background-color: #7f1d1d !important; border-color: #991b1b !important; }
        .dark .text-red-500, .dark .text-red-600 { color: #fca5a5 !important; }

        /* BLUE (Info Cards) */
        .dark .bg-blue-50 { background-color: #172554 !important; border-color: #1e3a8a !important; }
        .dark .text-blue-600 { color: #93c5fd !important; }

        /* AMBER/YELLOW (Adaptive Badge) */
        .dark .bg-yellow-50, .dark .bg-amber-50 { background-color: #422006 !important; border-color: #713f12 !important; }
        .dark .bg-amber-100 { background-color: #78350f !important; color: #fef3c7 !important; }
        .dark .text-yellow-800, .dark .text-amber-800 { color: #fde047 !important; }
        
        /* PINK (Hobby) */
        .dark .bg-pink-50 { background-color: #831843 !important; border-color: #9d174d !important; }
        .dark .text-pink-600, .dark .text-pink-800 { color: #f9a8d4 !important; }
        
        /* INDIGO (Revision) */
        .dark .bg-indigo-50 { background-color: #312e81 !important; border-color: #3730a3 !important; }
        .dark .bg-indigo-100 { background-color: #3730a3 !important; color: #e0e7ff !important; }
        .dark .text-indigo-600, .dark .text-indigo-700 { color: #818cf8 !important; }
      `;
      document.head.appendChild(style);
    } else {
      document.documentElement.classList.remove('dark');
      const existing = document.getElementById('dark-mode-styles');
      if (existing) existing.remove();
    }
  }, [data.settings.darkMode]);
// --- NOTIFICATION SYSTEM ---
  useEffect(() => {
    // 1. Only run if notifications are enabled and not in sim mode
    if (!data.settings.allowNotifications) return;
    if (data.settings.simulatedDay !== undefined || data.settings.simulatedHour !== undefined) return;

    // 2. Check for Day Reset (Fixes the "Forever Mute" bug)
    const todayStr = new Date().toISOString().split('T')[0];
    if (data.lastNotificationDate !== todayStr) {
        setData(prev => ({ ...prev, notifiedTaskIds: [], lastNotificationDate: todayStr }));
        return;
    }

    const checkInterval = setInterval(() => {
      const now = new Date();
      
      dailySchedule.forEach(slot => {
        if (slot.type === 'break' || slot.type === 'passed' || !slot.task) return;
        
        // Skip if already notified TODAY
        if (data.notifiedTaskIds.includes(slot.id)) return;

        const [h, m] = slot.startTime.split(':').map(Number);
        const taskTime = new Date();
        taskTime.setHours(h, m, 0, 0);

        const diffMs = taskTime.getTime() - now.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        // FIX: Use a window (28-32 mins) instead of exact check to catch browser timing drifts
        if (diffMins >= 28 && diffMins <= 32) {
           if (Notification.permission === 'granted') {
             new Notification(`Upcoming: ${slot.task.title}`, {
               body: `Starts at ${slot.startTime} (${diffMins} mins)`,
               icon: '/favicon.ico'
             });
           }

           // Mark as notified so we don't spam
           setData(prev => ({
             ...prev,
             notifiedTaskIds: [...prev.notifiedTaskIds, slot.id]
           }));
        }
      });
    }, 60000);

    return () => clearInterval(checkInterval);
  }, [dailySchedule, data.settings.allowNotifications, data.notifiedTaskIds, data.lastNotificationDate, data.settings.simulatedDay]);
  const weeklySchedule = useMemo(() => {
    if (dashboardView !== 'weekly') return [];
    const week = [];
    const start = new Date();
    if (start.getHours() < data.settings.workStartHour) start.setDate(start.getDate() - 1);

    if (data.settings.simulatedDay !== undefined) {
        const diff = data.settings.simulatedDay - start.getDay();
        start.setDate(start.getDate() + diff);
    }

    const simulatedCompletedIds = new Set<string>();

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const { schedule, completedIds } = generateScheduleForDate(d, data, categoryTendencies, undefined, simulatedCompletedIds);
      completedIds.forEach(id => simulatedCompletedIds.add(id));
      week.push({ date: d, schedule });
    }
    return week;
  }, [dashboardView, data.goals, data.logs, data.settings, categoryTendencies, data.categories, data.rewardBlocks]);

  const startTask = (task: any) => {
    if (task.type !== 'reward_block') {
        const newGoals = (data.goals || []).map(g => {
          if (g.id === task.parentId) return { ...g, wasStarted: true };
          return g;
        });
        setData(prev => ({ ...prev, goals: newGoals, activeTaskId: task.id, activeTaskType: task.type, activeTaskStartTime: Date.now() }));
    } else {
        // Starting a reward block
        setData(prev => ({ ...prev, activeTaskId: task.id, activeTaskType: 'reward_block', activeTaskStartTime: Date.now() }));
    }
  };

  const handleCompleteTask = (task: ActiveTaskWrapper, elapsedSeconds: number = 0) => {
    if (task.type === 'reward_block') {
         // Completing a reward just logs it and returns to dashboard
         const newLog: TaskLog = {
          id: generateId(), goalId: task.parentId, 
          categoryId: REWARD_CAT_ID, action: 'completed', timestamp: Date.now(),
          duration: Math.ceil(elapsedSeconds / 60), estimatedDuration: task.estimatedDuration,
          hourOfDay: new Date().getHours(), debtGenerated: 0, gainGenerated: 10, isJackpot: false
        };
        setData(prev => ({ ...prev, logs: [newLog, ...prev.logs], activeTaskId: null, activeTaskType: null, activeTaskStartTime: null }));
        setJustCompleted({ title: task.title, difficulty: 'easy', gain: 10, isJackpot: false });
        setCompletionType('complete'); setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3000);
        return;
    }

    const difficulty: Difficulty = task.difficulty || task.originalGoal?.difficulty || 'medium';
let gainAmount = DIFFICULTY_SCORE[difficulty];
    let isJackpot = false;
    const categoryDefault = data.categories.find(c => c.id === task.originalGoal?.categoryId)?.defaultRepetition || 'once';
    const repetition = task.originalGoal?.repetitionOverride || categoryDefault;
    const estimatedSeconds = task.estimatedDuration * 60;
    let newFreeTimeUntil = null;
    if (elapsedSeconds > 0 && elapsedSeconds < estimatedSeconds) {
       const remainingMillis = (estimatedSeconds - elapsedSeconds) * 1000;
       if (remainingMillis > 120000) newFreeTimeUntil = Date.now() + remainingMillis;
    }
    const newGoals = (data.goals || []).map(g => {
      if (g.id === task.parentId) {
        let newRevisionCount = g.revisionCount || 0;
        if (g.categoryId === REVISION_CAT_ID) newRevisionCount++;

        if (task.type === 'subgoal') {
          const newSubgoals = (g.subgoals || []).map((sg: any) => sg.id === task.id ? { ...sg, completed: true } : sg);
          const allSubComplete = newSubgoals.every((sg: any) => sg.completed);
          if (allSubComplete && (g.subgoals || []).length > 0) { 
             if (!g.jackpotAwardedForCycle) { isJackpot = true; gainAmount += JACKPOT_BONUS; } 
          }
          if (allSubComplete) {
             if (repetition !== 'once') {
               const resetSubgoals = newSubgoals.map((sg: any) => ({...sg, completed: false}));
               return { ...g, subgoals: resetSubgoals, lastCompletedAt: Date.now(), wasStarted: false, snoozedUntil: undefined, deferredUntil: undefined, jackpotAwardedForCycle: false, revisionCount: newRevisionCount };
             } else {
               return { ...g, subgoals: newSubgoals, completed: true, wasStarted: false, jackpotAwardedForCycle: true, revisionCount: newRevisionCount };
             }
          }
          return { ...g, subgoals: newSubgoals, revisionCount: newRevisionCount };
        } else {
          if (repetition !== 'once') return { ...g, lastCompletedAt: Date.now(), wasStarted: false, snoozedUntil: undefined, deferredUntil: undefined, revisionCount: newRevisionCount };
          else return { ...g, completed: true, wasStarted: false, revisionCount: newRevisionCount };
        }
      }
      return g;
    });
    const newLog: TaskLog = {
      id: generateId(), goalId: task.parentId, subgoalId: task.type === 'subgoal' ? task.id : undefined,
      categoryId: task.originalGoal?.categoryId || '', action: 'completed', timestamp: Date.now(),
      duration: Math.ceil(elapsedSeconds / 60), estimatedDuration: task.estimatedDuration,
      hourOfDay: new Date().getHours(), debtGenerated: 0, gainGenerated: gainAmount, isJackpot
    };
    setData(prev => ({ ...prev, goals: newGoals, gain: prev.gain + gainAmount, logs: [newLog, ...prev.logs], activeTaskId: null, activeTaskType: null, activeTaskStartTime: null, freeTimeUntil: newFreeTimeUntil }));
    setJustCompleted({ title: task.title, difficulty: task.difficulty, gain: gainAmount, isJackpot }); 
    setCompletionType('complete'); setJackpotTriggered(isJackpot); setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3000);
  };

  const handleIncompleteTask = (task: ActiveTaskWrapper, elapsedSeconds: number = 0) => {
    if (task.type === 'reward_block') {
         handleCompleteTask(task, elapsedSeconds); // Rewards don't typically have "incomplete" state logic, just finish them.
         return;
    }
    const gainAmount = 5; 
    const categoryDefault = data.categories.find(c => c.id === task.originalGoal?.categoryId)?.defaultRepetition || 'once';
    const repetition = task.originalGoal?.repetitionOverride || categoryDefault;

    const estimatedSeconds = task.estimatedDuration * 60;
    let newFreeTimeUntil = null;
    if (elapsedSeconds > 0 && elapsedSeconds < estimatedSeconds) {
       const remainingMillis = (estimatedSeconds - elapsedSeconds) * 1000;
       if (remainingMillis > 120000) newFreeTimeUntil = Date.now() + remainingMillis;
    }

    const newGoals = (data.goals || []).map(g => {
      if (g.id === task.parentId) {
        if (task.type === 'subgoal') {
             const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
             return { ...g, deferredUntil: tomorrow.getTime(), wasStarted: false };
        } else {
             if (repetition !== 'once') { return { ...g, lastCompletedAt: Date.now(), wasStarted: false }; } 
             else { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0); return { ...g, deferredUntil: tomorrow.getTime(), wasStarted: false }; }
        }
      }
      return g;
    });

    const newLog: TaskLog = {
      id: generateId(), goalId: task.parentId, subgoalId: task.type === 'subgoal' ? task.id : undefined,
      categoryId: task.originalGoal?.categoryId || '', action: 'incomplete', timestamp: Date.now(),
      duration: Math.ceil(elapsedSeconds / 60), estimatedDuration: task.estimatedDuration,
      hourOfDay: new Date().getHours(), debtGenerated: 0, gainGenerated: gainAmount, isJackpot: false
    };

    setData(prev => ({
      ...prev,
      goals: newGoals,
      gain: prev.gain + gainAmount,
      logs: [newLog, ...prev.logs],
      activeTaskId: null,
      activeTaskType: null,
      activeTaskStartTime: null,
      freeTimeUntil: newFreeTimeUntil
    }));
    
    setJustCompleted({ title: task.title, difficulty: task.difficulty, gain: gainAmount });
    setCompletionType('incomplete');
  };

  const handleSnoozeTask = (task: any, reason: string) => { const penalty = 5; const newLog: TaskLog = { id: generateId(), goalId: task.parentId, subgoalId: task.type === 'subgoal' ? task.id : undefined, categoryId: task.originalGoal.categoryId, action: 'snoozed', timestamp: Date.now(), hourOfDay: new Date().getHours(), reason, debtGenerated: penalty, gainGenerated: 0 }; const newGoals = (data.goals || []).map(g => { if (g.id === task.parentId) return { ...g, snoozedUntil: Date.now() + 3600000 }; return g; }); setData(prev => ({ ...prev, goals: newGoals, debt: prev.debt + penalty, logs: [newLog, ...prev.logs] })); };
  const handleSkipTask = (task: any, reason: string) => { 
      const penalty = 15; 
      // FIX: Handle Reward Block skipping
      const categoryId = task.type === 'reward_block' ? REWARD_CAT_ID : (task.originalGoal.categoryId || '');
      
      const newLog: TaskLog = { 
          id: generateId(), 
          goalId: task.parentId, // reward.id
          subgoalId: task.type === 'subgoal' ? task.id : undefined, 
          categoryId: categoryId, 
          action: 'skipped', 
          timestamp: Date.now(), 
          hourOfDay: new Date().getHours(), 
          reason, 
          debtGenerated: penalty, 
          gainGenerated: 0 
      }; 

      if (task.type !== 'reward_block') {
          const newGoals = (data.goals || []).map(g => { if (g.id === task.parentId) { if (g.fixedTime || g.fixedDate) { return { ...g, lastCompletedAt: Date.now() }; } const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0); return { ...g, deferredUntil: tomorrow.getTime() }; } return g; }); 
          setData(prev => ({ ...prev, goals: newGoals, debt: prev.debt + penalty, logs: [newLog, ...prev.logs] })); 
      } else {
          // Just log the skip for rewards, scheduler will see it
          setData(prev => ({ ...prev, debt: prev.debt + penalty, logs: [newLog, ...prev.logs] }));
      }
  };
  const handleMoveTask = (taskId: string, parentId: string, newDate: Date) => { const dateStr = newDate.toISOString().split('T')[0]; const task = data.goals.find(g => g.id === parentId); if (task) { const newLog: TaskLog = { id: generateId(), goalId: parentId, subgoalId: taskId !== parentId ? taskId : undefined, categoryId: task.categoryId, action: 'moved', timestamp: newDate.getTime(), hourOfDay: 12, reason: 'Manual Reschedule', debtGenerated: 0, gainGenerated: 0 }; setData(prev => ({ ...prev, logs: [newLog, ...prev.logs] })); } setData(prev => ({ ...prev, goals: prev.goals.map(g => { if (g.id === parentId) { return { ...g, fixedDate: dateStr, repetitionOverride: 'once' }; } return g; }) })); setMovingTaskId(null); alert(`Task moved to ${DAYS_FULL[newDate.getDay()]}`); };
  const toggleRewardMode = () => { if (!rewardMode) { setShowRewardInput(true); } else { setData(prev => ({ ...prev, debt: prev.debt + 10 })); setRewardMode(false); } };
  const confirmRewardMode = () => { if (!rewardReason.trim()) return; setRewardMode(true); setShowRewardInput(false); const newLog: TaskLog = { id: generateId(), goalId: 'reward', subgoalId: undefined, categoryId: 'reward', action: 'reward_start', timestamp: Date.now(), hourOfDay: new Date().getHours(), reason: rewardReason, debtGenerated: 0, gainGenerated: 0 }; const nextTaskSlot = dailySchedule.find(s => s.type !== 'break' && s.type !== 'passed'); let updatedGoals = data.goals; if (nextTaskSlot && nextTaskSlot.task && !nextTaskSlot.isFixed) { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0); updatedGoals = updatedGoals.map(g => { if (g.id === nextTaskSlot.task!.parentId) { return { ...g, deferredUntil: tomorrow.getTime() }; } return g; }); } setData(prev => ({ ...prev, goals: updatedGoals, logs: [newLog, ...prev.logs] })); setRewardReason(''); };
  const handlePause = () => { setData(prev => ({ ...prev, activeTaskId: null, activeTaskType: null, activeTaskStartTime: null })); };


  // --- In-Component Views ---

  const InProgressView = () => {
    // 1. Setup Active Task
    let activeTask: ActiveTaskWrapper | null = null; 
    (data.goals || []).forEach(g => { 
        if (data.activeTaskType === 'goal' && g.id === data.activeTaskId) { activeTask = { ...g, type: 'goal', parentId: g.id, originalGoal: g, estimatedDuration: g.timing || 60, difficulty: g.difficulty }; } 
        else if (!data.activeTaskType && g.id === data.activeTaskId) { activeTask = { ...g, type: 'goal', parentId: g.id, originalGoal: g, estimatedDuration: g.timing || 60, difficulty: g.difficulty }; }
        (g.subgoals || []).forEach(sg => { 
            if (data.activeTaskType === 'subgoal' && sg.id === data.activeTaskId) { activeTask = { ...sg, type: 'subgoal', parentId: g.id, originalGoal: g, estimatedDuration: sg.timing || 45, difficulty: sg.difficulty || g.difficulty, title: `${g.title}: ${sg.title}` }; } 
            else if (!data.activeTaskType && sg.id === data.activeTaskId) { activeTask = { ...sg, type: 'subgoal', parentId: g.id, originalGoal: g, estimatedDuration: sg.timing || 45, difficulty: sg.difficulty || g.difficulty, title: `${g.title}: ${sg.title}` }; } 
        }); 
    });
    
    // Check rewards if not found
    if (!activeTask) {
        const rewardBlock = data.rewardBlocks.find(r => r.id === data.activeTaskId);
        if (rewardBlock) {
             activeTask = {
                 type: 'reward_block',
                 id: rewardBlock.id,
                 parentId: rewardBlock.id,
                 title: rewardBlock.label,
                 originalGoal: { categoryId: REWARD_CAT_ID, ...rewardBlock } as any,
                 estimatedDuration: (rewardBlock.endTime - rewardBlock.startTime) / 60000,
                 difficulty: 'easy'
             };
        }
    }

    // 2. State Hooks
    const [elapsed, setElapsed] = useState(0); 
    const [photo, setPhoto] = useState<File | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [zenMode, setZenMode] = useState(false); // <--- NEW: Zen State

    // 3. Timer Logic & Tab Title
    useEffect(() => { 
      const interval = setInterval(() => { 
        if (data.activeTaskStartTime) {
          const sec = Math.floor((Date.now() - data.activeTaskStartTime) / 1000);
          setElapsed(sec);
          
          const totalSec = (activeTask as any).estimatedDuration * 60;
          const remaining = totalSec - sec;
          
          if (remaining > 0) {
            const m = Math.floor(remaining / 60);
            const s = (remaining % 60).toString().padStart(2, '0');
            document.title = `(${m}:${s}) ${activeTask?.title}`;
          } else {
             document.title = "⏰ Time's Up!";
          }
        }
      }, 1000); 
      return () => { clearInterval(interval); document.title = "TimeFlow"; };
    }, [data.activeTaskStartTime, activeTask]);

    if (!activeTask) return <div className="text-center p-4">Error: Task data lost. <button onClick={handlePause} className="text-blue-500 underline">Reset</button></div>; 
    
    const durationSecs = (activeTask as any).estimatedDuration * 60; 
    const isOvertime = elapsed > durationSecs;
    const isReward = (activeTask as any).type === 'reward_block'; // <--- NEW: Check Type

    // --- ZEN MODE OVERLAY ---
    if (zenMode) {
        return (
            <div className="fixed inset-0 z-50 bg-gray-900 text-white flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
                {/* Exit Button */}
                <button 
                    onClick={() => setZenMode(false)}
                    className="absolute top-6 right-6 p-3 bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Zen Content */}
                <div className="space-y-12 text-center max-w-md w-full">
                    <div>
                        <div className="text-gray-400 font-medium uppercase tracking-widest text-sm mb-4">Focusing On</div>
                        <h2 className="text-4xl font-bold leading-tight">{(activeTask as any).title}</h2>
                    </div>

                    <div className={`font-mono font-black text-8xl tracking-wider ${isOvertime ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}
                    </div>
                    
                    {/* Zen Controls */}
                    <div className="grid grid-cols-2 gap-4 pt-8">
                         <button 
                            onClick={handlePause} 
                            className="py-4 bg-gray-800 text-gray-300 rounded-2xl font-bold text-lg hover:bg-gray-700 transition-colors"
                         >
                            Pause
                         </button>
                         <button 
                            onClick={() => { setZenMode(false); setVerifying(true); }} 
                            className="py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-900/50 hover:bg-blue-500 transition-colors"
                         >
                            Finish
                         </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- STANDARD VIEW ---
    return (
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-blue-100 p-6 flex flex-col items-center text-center space-y-6 animate-in fade-in">
        <div className="w-full flex justify-between items-center">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">In Progress</span>
            {isOvertime && <span className="text-xs font-bold text-red-500 animate-pulse flex items-center"><AlertTriangle className="w-3 h-3 mr-1"/> Overtime</span>}
        </div>
        
        <div className="relative w-48 h-48 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
                <circle cx="96" cy="96" r="88" className="text-gray-100" strokeWidth="12" fill="none" stroke="currentColor" />
                <circle cx="96" cy="96" r="88" className={isOvertime ? "text-red-500" : "text-blue-500"} strokeWidth="12" fill="none" stroke="currentColor" strokeDasharray={553} strokeDashoffset={553 - (553 * Math.min((elapsed / durationSecs) * 100, 100)) / 100} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-black text-gray-800">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}</span>
                <span className="text-xs text-gray-400">of {(activeTask as any).estimatedDuration}m</span>
            </div>
        </div>

        <div>
            <h2 className="text-xl font-bold text-gray-800 leading-tight mb-1">{(activeTask as any).title}</h2>
            <CategoryBadge catId={(activeTask as any).originalGoal.categoryId} data={data} />
        </div>

        {!verifying ? (
            <div className="w-full space-y-3">
                <div className="flex space-x-2">
                    <button onClick={() => setVerifying(true)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-200">
                        Verify & Finish
                    </button>
                    {/* ZEN BUTTON: Only show if NOT a reward */}
                    {!isReward && (
                        <button onClick={() => setZenMode(true)} className="w-16 bg-gray-900 text-white rounded-xl flex items-center justify-center shadow-lg hover:bg-gray-700" title="Enter Zen Mode">
                            <Zap className="w-6 h-6" />
                        </button>
                    )}
                </div>
                <button onClick={handlePause} className="text-gray-400 text-sm hover:text-red-500">Cancel / Pause</button>
            </div>
        ) : (
            <div className="w-full bg-gray-50 p-4 rounded-xl space-y-3">
                <p className="text-sm text-gray-600 font-bold">Great work! Upload proof.</p>
                <label className="block w-full p-4 border-2 border-dashed border-blue-300 rounded-lg text-center cursor-pointer hover:bg-blue-50 text-blue-500">
                    <input type="file" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files ? e.target.files[0] : null)} />
                    <Camera className="w-8 h-8 mx-auto mb-1" />
                    {photo ? <span className="text-green-600 font-bold">{photo.name}</span> : 'Tap to Take Photo'}
                </label>
                <div className="flex space-x-2">
                    <button onClick={() => setVerifying(false)} className="flex-1 bg-gray-200 text-gray-600 py-3 rounded-xl font-bold">Back</button>
                    <button onClick={() => handleIncompleteTask(activeTask!, elapsed)} className="flex-1 bg-yellow-500 text-white py-3 rounded-xl font-bold">Incomplete (Defer)</button>
                    <button disabled={!photo} onClick={() => handleCompleteTask(activeTask!, elapsed)} className="flex-1 bg-green-500 text-white py-3 rounded-xl font-bold disabled:opacity-50">Complete</button>
                </div>
            </div>
        )}
      </div>
    );
  };

  const FreeTimeView = () => {
    const [timeLeft, setTimeLeft] = useState(0); useEffect(() => { const interval = setInterval(() => { if (data.freeTimeUntil) { const diff = Math.max(0, Math.ceil((data.freeTimeUntil - Date.now()) / 1000)); setTimeLeft(diff); if (diff <= 0) setData(prev => ({ ...prev, freeTimeUntil: null })); } }, 1000); return () => clearInterval(interval); }, [data.freeTimeUntil]); if (timeLeft <= 0) return null;
    return (<div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl shadow-xl overflow-hidden border border-indigo-100 p-6 text-center space-y-4 animate-in fade-in mb-6"><div className="flex items-center justify-center space-x-4"><div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm"><Coffee className="w-8 h-8 text-indigo-500" /></div><div className="text-left"><h2 className="text-xl font-black text-gray-800">Earned Free Time</h2><div className="text-3xl font-mono font-black text-indigo-600 leading-none">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div></div></div><button onClick={() => setData(prev => ({ ...prev, freeTimeUntil: null }))} className="w-full bg-white text-indigo-600 py-2 rounded-lg font-bold shadow-sm text-sm border border-indigo-100">Skip Break & Continue</button></div>);
  };

  const Dashboard = () => {
const [viewingTask, setViewingTask] = useState<ScheduleSlot | null>(null);
    const [actionReason, setActionReason] = useState(''); const [actionType, setActionType] = useState<'snooze'|'skip'|null>(null);
    
    const todaysHobby = dailySchedule.find(s => s.task?.isHobby && s.type !== 'passed' && s.type !== 'break');
    const revisionDueCount = (data.goals || []).filter(g => g.categoryId === REVISION_CAT_ID && !g.completed && calculateRevisionScore(g, new Date(), g.lastCompletedAt) > 1.5).length;
    const adaptiveChanges = (data.goals || []).filter(g => g.categoryId === ADAPTIVE_CAT_ID && g.adaptiveStatus && g.adaptiveStatus !== 'stable');

    if (justCompleted) return (<div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6 animate-in zoom-in duration-300"><div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${completionType === 'complete' ? 'bg-green-100' : 'bg-yellow-100'}`}>{completionType === 'complete' ? <Check className="w-12 h-12 text-green-600" /> : <Hourglass className="w-12 h-12 text-yellow-600" />}</div><div><h2 className="text-3xl font-black text-gray-800">{completionType === 'complete' ? 'Mission Complete!' : 'Progress Logged'}</h2><p className="text-gray-500 mt-2">Task: <span className="font-bold text-gray-800">{justCompleted.title}</span></p>{justCompleted.isJackpot && <p className="text-purple-600 font-bold animate-pulse mt-1">JACKPOT BONUS!</p>}</div><div className="bg-gray-50 p-4 rounded-xl border border-gray-100 w-full"><p className="text-sm text-gray-500 mb-1">Total Gain</p><p className={`text-2xl font-black ${completionType === 'complete' ? 'text-green-600' : 'text-yellow-600'}`}>+{justCompleted.gain} pts</p></div><button onClick={() => setJustCompleted(null)} className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold shadow-lg">Continue Day</button></div>);
    if (data.activeTaskId) return <div className="space-y-6 pb-24"><InProgressView /></div>;
    const nextTaskSlot = dailySchedule.find(s => s.type !== 'break' && s.type !== 'passed'); 
    const nextTask = nextTaskSlot?.task;
    
    return (
      <div className="space-y-6 pb-24">
        {revisionDueCount > 0 && (<div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-2"><div className="flex items-center space-x-3"><div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center"><BookOpen className="w-5 h-5 text-indigo-600" /></div><div><p className="text-xs font-bold text-indigo-800 uppercase">Spaced Revision</p><p className="text-sm font-bold text-gray-800">{revisionDueCount} topics overdue</p></div></div></div>)}
        {adaptiveChanges.length > 0 && (<div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-2"><div className="flex items-center space-x-3"><div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-600" /></div><div><p className="text-xs font-bold text-amber-800 uppercase">Adaptive Habits</p><p className="text-sm font-bold text-gray-800">{adaptiveChanges.length} frequency changes</p></div></div></div>)}
        {todaysHobby && !data.activeTaskId && !data.freeTimeUntil && (<div className="bg-pink-50 border border-pink-100 p-3 rounded-xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-2"><div className="flex items-center space-x-3"><div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center"><Palette className="w-5 h-5 text-pink-600" /></div><div><p className="text-xs font-bold text-pink-800 uppercase">Today's Hobby</p><p className="text-sm font-bold text-gray-800">{todaysHobby.task?.title}</p><p className="text-[10px] text-pink-600">Neglected for {todaysHobby.task?.daysNeglected} days!</p></div></div><button onClick={() => startTask(todaysHobby.task)} className="bg-pink-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">Start</button></div>)}
        {dailyHobbyStatus === 'rest' && (<div className="bg-green-50 border border-green-100 p-2 rounded-lg text-center text-xs font-bold text-green-700 mb-2">🌱 All hobbies current. Enjoy your rest!</div>)}
        {(data.settings.simulatedDay !== undefined || data.settings.simulatedHour !== undefined) && (<div className="bg-orange-100 text-orange-800 p-2 rounded-lg text-center text-xs font-bold mb-4 border border-orange-200">⚠️ Simulating: {data.settings.simulatedDay !== undefined ? DAYS_FULL[data.settings.simulatedDay] : 'Today'} @ {data.settings.simulatedHour !== undefined ? `${data.settings.simulatedHour}:00` : 'Now'}</div>)}
        <div className="flex bg-gray-100 p-1 rounded-lg mb-4"><button onClick={() => setDashboardView('daily')} className={`flex-1 py-2 text-xs font-bold rounded-md ${dashboardView === 'daily' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Today</button><button onClick={() => setDashboardView('weekly')} className={`flex-1 py-2 text-xs font-bold rounded-md ${dashboardView === 'weekly' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Weekly Roadmap</button></div>
        {data.freeTimeUntil && data.freeTimeUntil > Date.now() && <FreeTimeView />}
        {dashboardView === 'daily' ? (
          <>
            <div className="grid grid-cols-2 gap-4"><div className="bg-red-50 p-4 rounded-2xl border border-red-200"><div className="text-red-500 font-bold text-xs uppercase">Debt</div><div className="text-3xl font-black text-gray-800">{data.debt}</div></div><div className="bg-green-50 p-4 rounded-2xl border border-green-200"><div className="text-green-600 font-bold text-xs uppercase">Gain</div><div className="text-3xl font-black text-gray-800">{data.gain}</div></div></div>
            <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-6 mt-4"><div className="flex items-center justify-between"><div><h3 className="font-bold text-purple-900">Reward Mode</h3><p className="text-xs text-purple-700">Accumulate debt to take a break.</p></div><button onClick={toggleRewardMode} className={`px-4 py-2 rounded-lg font-bold shadow-sm transition-all ${rewardMode ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white text-purple-600 hover:bg-purple-100'}`}>{rewardMode ? 'Stop' : 'Start'}</button></div>{showRewardInput && (<div className="mt-4 bg-white p-3 rounded-lg animate-in slide-in-from-top-2"><p className="text-xs font-bold text-gray-500 mb-2">Why are you taking a break?</p><input value={rewardReason} onChange={e => setRewardReason(e.target.value)} className="w-full p-2 border border-purple-200 rounded text-sm mb-2" placeholder="e.g. Brain fog..." /><div className="flex space-x-2"><button onClick={() => { setShowRewardInput(false); setRewardReason(''); }} className="flex-1 py-2 bg-gray-100 text-gray-600 rounded text-xs font-bold">Cancel</button><button disabled={!rewardReason} onClick={confirmRewardMode} className="flex-1 py-2 bg-purple-600 text-white rounded text-xs font-bold disabled:opacity-50">Start Break</button></div></div>)}</div>
            {rewardMode ? (<div className="text-center py-10 opacity-75"><Coffee className="w-16 h-16 mx-auto text-purple-400 mb-4" /><h2 className="text-2xl font-bold text-gray-700">Enjoy your break!</h2></div>) : nextTask ? (<div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 relative"><div className={`h-2 w-full ${nextTask.originalGoal?.priority === 'critical' ? 'bg-red-500' : 'bg-blue-500'}`} /><div className="p-6"><div className="flex justify-between items-start mb-4"><CategoryBadge catId={nextTask.originalGoal?.categoryId || ''} data={data} />{nextTaskSlot?.isFixed && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold">Fixed {nextTaskSlot.startTime}</span>}{nextTaskSlot?.type === 'ongoing' && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold ml-2 flex items-center animate-pulse"><Play className="w-3 h-3 mr-1"/> Ongoing</span>}{nextTaskSlot?.type === 'overlap' && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded font-bold ml-2 flex items-center"><AlertOctagon className="w-3 h-3 mr-1"/> Overlap</span>}{nextTask.isAdaptive && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded font-bold ml-2 flex items-center"><Zap className="w-3 h-3 mr-1"/> Adaptive</span>}{nextTask.isRevision && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold ml-2 flex items-center"><BookOpen className="w-3 h-3 mr-1"/> Rev</span>}</div><h2 className="text-2xl font-bold text-gray-800 mb-2">{nextTask.title}</h2><div className="flex items-center text-sm text-gray-500 mb-6"><Clock className="w-4 h-4 mr-1"/> {nextTask.estimatedDuration}m<span className="mx-2">•</span><AlertTriangle className="w-4 h-4 mr-1 text-orange-500"/> {nextTask.difficulty}</div>{actionType ? (<div className="space-y-2 bg-gray-50 p-3 rounded-lg animate-in fade-in"><p className="text-xs font-bold text-gray-500">Why are you {actionType}ing?</p><input value={actionReason} onChange={e => setActionReason(e.target.value)} className="w-full p-2 border rounded text-sm" placeholder="Reason..." /><div className="flex space-x-2"><button onClick={() => { setActionType(null); setActionReason(''); }} className="flex-1 py-2 bg-gray-200 rounded text-xs font-bold">Cancel</button><button disabled={!actionReason} onClick={() => { if(actionType === 'snooze') handleSnoozeTask(nextTask, actionReason); else handleSkipTask(nextTask, actionReason); setActionType(null); setActionReason(''); }} className="flex-1 py-2 bg-red-500 text-white rounded text-xs font-bold disabled:opacity-50">Confirm</button></div></div>) : (<div className="grid grid-cols-4 gap-2"><button onClick={() => startTask(nextTask)} className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center shadow-lg"><Play className="w-4 h-4 mr-2" /> Start</button><button onClick={() => setActionType('snooze')} disabled={nextTask.type === 'reward_block'} className="bg-orange-50 text-orange-600 border border-orange-200 rounded-xl font-bold text-xs hover:bg-orange-100 disabled:opacity-50">Snooze</button><button onClick={() => setActionType('skip')} className="bg-gray-50 text-gray-600 border border-gray-200 rounded-xl font-bold text-xs hover:bg-gray-100">Skip</button></div>)}</div></div>) : (<div className="text-center py-20 text-gray-400"><CheckCircle className="w-16 h-16 mx-auto mb-4" /><h2 className="text-2xl font-bold text-gray-300">All caught up!</h2><p>Enjoy your free time.</p></div>)}
            <div className="mt-8"><h3 className="text-lg font-bold text-gray-800 mb-4">Today's Roadmap</h3><div className="space-y-4">{dailySchedule.map((slot, idx) => (<div 
  key={idx} 
  onClick={() => setViewingTask(slot)} // <--- CLICK HANDLER
  className={`flex items-start cursor-pointer transition-colors hover:bg-gray-50/50 rounded-lg ${slot.type === 'passed' ? 'opacity-50 grayscale' : ''}`}
><div className="w-16 text-xs font-bold text-gray-400 pt-1">{slot.startTime}</div><div className={`flex-1 p-3 rounded-xl border ${slot.type === 'break' ? 'bg-green-50 border-green-100' : slot.type === 'overlap' ? 'bg-orange-50 border-orange-200' : (slot.type === 'reward_block' || slot.type === 'ongoing') ? 'bg-purple-50 border-purple-100' : 'bg-white border-gray-100 shadow-sm'}`}>{slot.type === 'break' ? <span className="text-green-700 font-bold flex items-center"><Coffee className="w-4 h-4 mr-2"/> {slot.reason}</span> : (slot.type === 'reward_block' || slot.type === 'ongoing') ? <span className="text-purple-700 font-bold flex items-center"><Gift className="w-4 h-4 mr-2"/> {slot.task?.title} {slot.type === 'ongoing' && <span className="text-xs bg-purple-200 text-purple-800 ml-2 px-1 rounded">Active</span>}</span> : slot.type === 'passed' ? <div><div className="font-bold text-gray-500 line-through">{slot.task?.title}</div><div className="text-xs text-gray-400">Passed</div></div> : <div><div className="font-bold text-gray-700">{slot.task?.title}{slot.type === 'overlap' && <span className="text-xs text-orange-600 ml-2">(Overlap)</span>}{slot.task?.isHobby && <span className="text-xs text-pink-600 ml-2">🎨 Hobby</span>}{slot.task?.isRevision && <span className="text-xs text-indigo-600 ml-2">📚 Rev</span>}{slot.task?.isAdaptive && <span className="text-xs text-amber-600 ml-2">⚡ Adapt</span>}</div><div className="text-xs text-gray-400">{slot.task?.estimatedDuration}m • {slot.task?.difficulty}</div></div>}</div></div>))}</div></div>
          </>
        ) : (
          <div className="space-y-4">
             {weeklySchedule.map((day, dayIdx) => {
               const tasks = day.schedule.filter(s => s.type !== 'break' && s.type !== 'passed' && s.type !== 'reward_block');
               const isExpanded = expandedDay === dayIdx;
               return (
                 <div key={dayIdx} className="bg-white rounded-xl border border-gray-100 overflow-hidden transition-all duration-200">
                    <div className="bg-gray-50 px-4 py-2 font-bold text-sm text-gray-700 flex justify-between items-center" onClick={() => setExpandedDay(isExpanded ? null : dayIdx)}><div className="flex items-center space-x-2"><span>{DAYS_FULL[day.date.getDay()]}</span><span className="text-gray-400 font-normal">{day.date.getDate()}</span></div>{isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</div>
                    <div className="p-2 space-y-1">
                      {tasks.length === 0 ? (<div className="text-xs text-gray-400 text-center py-2">No tasks</div>) : (
                        (isExpanded ? tasks : tasks.slice(0, 3)).map((slot, i) => (
                          <div key={i} className="flex items-center text-xs p-2 rounded hover:bg-gray-50 group"><div className="w-12 font-mono text-gray-400">{slot.startTime}</div><div className="flex-1 truncate text-gray-700 font-medium">{slot.task?.title || 'Busy'}</div>{isExpanded && (<button onClick={(e) => { e.stopPropagation(); setMovingTaskId(movingTaskId === slot.task?.id ? null : slot.task?.id || null); }} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"><CalendarDays className="w-4 h-4" /></button>)}{movingTaskId === slot.task?.id && (<div className="absolute right-8 bg-white shadow-xl border border-gray-200 rounded-lg p-2 flex space-x-1 z-10 animate-in zoom-in-95 grid grid-cols-4 gap-1 w-40">{DAYS_SHORT.map((d, dIdx) => (<button key={dIdx} onClick={(e) => { e.stopPropagation(); const targetDate = new Date(day.date); targetDate.setDate(targetDate.getDate() - targetDate.getDay() + dIdx); if (slot.task) handleMoveTask(slot.task.id!, slot.task.parentId, targetDate); }} className="w-8 h-8 rounded bg-gray-100 hover:bg-blue-100 text-[10px] font-bold text-gray-600 hover:text-blue-600 flex items-center justify-center">{d}</button>))}</div>)}</div>
                        ))
                      )}
                      {!isExpanded && tasks.length > 3 && (<button onClick={() => setExpandedDay(dayIdx)} className="w-full text-center text-xs text-blue-500 py-2 font-bold hover:bg-blue-50 rounded">+ {tasks.length - 3} more</button>)}
                      {isExpanded && tasks.length > 3 && (<button onClick={() => setExpandedDay(null)} className="w-full text-center text-xs text-gray-400 py-2 hover:bg-gray-50 rounded">Show Less</button>)}
                    </div>
                 </div>
               );
             })}
          </div>
        )}
{/* --- TASK DETAILS POPUP --- */}
    {viewingTask && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setViewingTask(null)}>
         <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 border border-gray-100" onClick={e => e.stopPropagation()}>
            {/* Color Header */}
            <div className="h-3 w-full" style={{ backgroundColor: (data.categories.find(c => c.id === viewingTask?.task?.originalGoal?.categoryId)?.color || '#3b82f6') }} />
            
            <div className="p-6 space-y-6">
               <div className="flex justify-between items-start">
                  <h3 className="text-2xl font-black text-gray-800 leading-tight">{viewingTask?.task?.title || 'Break/Gap'}</h3>
                  <button onClick={() => setViewingTask(null)} className="p-1 bg-gray-100 rounded-full hover:bg-red-100 hover:text-red-500 transition-colors"><X className="w-5 h-5" /></button>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                     <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Time</p>
                     <p className="font-bold text-gray-800 flex items-center"><Clock className="w-4 h-4 mr-2 text-blue-500"/> {viewingTask?.startTime}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                     <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Duration</p>
                     <p className="font-bold text-gray-800 flex items-center"><Hourglass className="w-4 h-4 mr-2 text-blue-500"/> {viewingTask?.task?.estimatedDuration || 0}m</p>
                  </div>
               </div>

               <div className="space-y-3">
                   <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                       <span className="text-sm font-bold text-gray-500">Category</span>
                       <CategoryBadge catId={viewingTask?.task?.originalGoal?.categoryId || ''} data={data} />
                   </div>
                   <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                       <span className="text-sm font-bold text-gray-500">Difficulty</span>
                       <span className={`text-sm font-bold px-2 py-0.5 rounded capitalize ${viewingTask?.task?.difficulty === 'hard' ? 'bg-red-100 text-red-600' : viewingTask?.task?.difficulty === 'easy' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                           {viewingTask?.task?.difficulty || 'N/A'}
                       </span>
                   </div>
                   {viewingTask?.type === 'passed' && (
                       <div className="p-3 rounded-xl bg-gray-100 text-center font-bold text-gray-400 text-sm">
                           Task Completed / Passed
                       </div>
                   )}
               </div>

               {/* ACTION BUTTONS (The New Part) */}
               {viewingTask?.task && (
                   <div className="grid grid-cols-2 gap-3 pt-2">
                      <button 
                        onClick={() => { 
                            handleIncompleteTask(viewingTask.task!); 
                            setViewingTask(null); 
                        }} 
                        className="w-full bg-yellow-100 text-yellow-700 py-3 rounded-xl font-bold shadow-sm hover:bg-yellow-200 transition-colors"
                      >
                        Skip / Defer
                      </button>
                      <button 
                        onClick={() => { 
                            handleCompleteTask(viewingTask.task!); 
                            setViewingTask(null); 
                        }} 
                        className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-transform active:scale-95"
                      >
                        Complete
                      </button>
                   </div>
               )}

               <button onClick={() => setViewingTask(null)} className="w-full text-gray-400 text-xs font-bold py-2 hover:text-gray-600">
                  Dismiss
               </button>
            </div>
         </div>
      </div>
    )}
</div>
    );
  };

  const GoalManager = () => { 
    const [mode, setMode] = useState<'create' | 'list'>('create');
    const [createModeType, setCreateModeType] = useState<'visual' | 'bulk'>('visual');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [bulkText, setBulkText] = useState('');
    const [title, setTitle] = useState('');
    const [catId, setCatId] = useState(data.categories[0]?.id || '');
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const [deadline, setDeadline] = useState('');
    const [priority, setPriority] = useState<Priority>('medium');
    const [repetition, setRepetition] = useState<Repetition>('once');
    const [selectedDays, setSelectedDays] = useState<number[]>([]);
    const [fixedTime, setFixedTime] = useState('');
    const [fixedDate, setFixedDate] = useState('');
    const [subgoalText, setSubgoalText] = useState('');
    const [subgoalDiff, setSubgoalDiff] = useState<Difficulty>('medium');
    const [subgoalTime, setSubgoalTime] = useState(30);
    const [subgoals, setSubgoals] = useState<SubGoal[]>([]);
    const toggleDay = (dayIdx: number) => { setSelectedDays(prev => prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx]); };
    const addSubgoal = () => { if (!subgoalText.trim()) return; setSubgoals([...subgoals, { id: generateId(), title: subgoalText, completed: false, difficulty: subgoalDiff, timing: subgoalTime }]); setSubgoalText(''); };
    const loadGoalForEdit = (goal: Goal) => { setEditingId(goal.id); setTitle(goal.title); setCatId(goal.categoryId); setDifficulty(goal.difficulty); setDeadline(goal.deadline); setPriority(goal.priority); setRepetition(goal.repetitionOverride || 'once'); setSelectedDays(goal.repeatSpecificDays || []); setFixedTime(goal.fixedTime || ''); setFixedDate(goal.fixedDate || ''); setSubgoals(goal.subgoals || []); setMode('create'); setCreateModeType('visual'); };
    const handleBulkSubmit = () => { 
      const regex = /\[(.*?)\]/g; 
      const matches = bulkText.match(regex); 
      if (!matches) return alert('Invalid format'); 
      
      const newGoals: Goal[] = []; 
      const newRewards: RewardBlock[] = [];

      const dayMap: { [key: string]: number } = { su: 0, sun: 0, sunday: 0, mo: 1, mon: 1, monday: 1, tu: 2, tue: 2, tuesday: 2, we: 3, wed: 3, wednesday: 3, th: 4, thu: 4, thursday: 4, fr: 5, fri: 5, friday: 5, sa: 6, sat: 6, saturday: 6 }; 
      
      matches.forEach(match => { 
        const content = match.replace('[', '').replace(']', ''); 
        const parts = content.split(',').map(s => s.trim()); 
        
        if (parts.length < 3) return; 

        if (parts[0].toLowerCase() === 'hobby') {
            const [_, name, diff, dl, time, rep] = parts;
             const cleanRep = (rep || '').toLowerCase().trim(); 
             let finalRep: Repetition = 'once';
             let specificDays: number[] = [];
            if (['daily', 'weekly', 'weekdays', 'weekends', 'once'].includes(cleanRep)) { finalRep = cleanRep as Repetition; } else if (cleanRep.includes('|') || cleanRep.includes('/') || Object.keys(dayMap).some(d => cleanRep.startsWith(d))) { const delimiters = /[|/\s]+/; const dayParts = cleanRep.split(delimiters); const indices = dayParts.map(p => dayMap[p.trim().toLowerCase().substring(0, 3)] ?? dayMap[p.trim().toLowerCase().substring(0, 2)]); const validIndices = indices.filter(i => i !== undefined); if (validIndices.length > 0) { finalRep = 'specific_days'; specificDays = [...new Set(validIndices)]; } } 

            newGoals.push({
              id: generateId(), title: name.replace(/"/g, ''), categoryId: HOBBIES_CAT_ID, difficulty: (diff as Difficulty) || 'easy', deadline: dl, timing: parseInt(time) || 45, priority: 'medium', repetitionOverride: finalRep, repeatSpecificDays: specificDays.length > 0 ? specificDays : undefined, subgoals: [], completed: false, createdAt: Date.now(), wasStarted: false
            });
            return;
        }

        if (parts[0].toLowerCase() === 'reward') {
             if (parts.length >= 5) {
                 const label = parts[1].replace(/"/g, '');
                 const startStr = parts[2];
                 const endStr = parts[3];
                 const rep = parts[4].toLowerCase().trim();
                 
                 const parseDateTime = (dtStr: string) => {
                     const [d, t] = dtStr.split(' ');
                     const date = parseDateStr(d);
                     const time = parseTimeStr(t);
                     if(date && time) return new Date(`${date}T${time}`);
                     return null;
                 };

                 const start = parseDateTime(startStr);
                 const end = parseDateTime(endStr);
                 
                 if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
                     let finalRep: Repetition = 'once';
                     let specificDays: number[] = [];

                     if (['daily', 'weekly', 'weekdays', 'weekends', 'once'].includes(rep)) {
                        finalRep = rep as Repetition;
                     } else {
                        // Try to parse specific days
                         const delimiters = /[|/\s]+/;
                         const dayParts = rep.split(delimiters);
                         const indices = dayParts.map(p => dayMap[p.trim().toLowerCase().substring(0, 3)] ?? dayMap[p.trim().toLowerCase().substring(0, 2)]);
                         const validIndices = indices.filter(i => i !== undefined);
                         if (validIndices.length > 0) {
                             finalRep = 'specific_days';
                             specificDays = [...new Set(validIndices)];
                         }
                     }

                     newRewards.push({
                         id: generateId(),
                         startTime: start.getTime(),
                         endTime: end.getTime(),
                         label,
                         repetition: finalRep,
                         repeatSpecificDays: specificDays
                     });
                 }
             }
             return;
        }

        const [name, catName, diff, dl, time, prio, rep, fixDate, fixTime] = parts; 
        const category = (data.categories || []).find(c => c.name.toLowerCase() === (catName || '').toLowerCase()) || data.categories[0]; 
        const cleanRep = (rep || '').toLowerCase().trim(); 
        let finalRep: Repetition = 'once'; 
        let specificDays: number[] = []; 
        if (['daily', 'weekly', 'weekdays', 'weekends', 'once'].includes(cleanRep)) { finalRep = cleanRep as Repetition; } else if (cleanRep.includes('|') || cleanRep.includes('/') || Object.keys(dayMap).some(d => cleanRep.startsWith(d))) { const delimiters = /[|/\s]+/; const dayParts = cleanRep.split(delimiters); const indices = dayParts.map(p => dayMap[p.trim().toLowerCase().substring(0, 3)] ?? dayMap[p.trim().toLowerCase().substring(0, 2)]); const validIndices = indices.filter(i => i !== undefined); if (validIndices.length > 0) { finalRep = 'specific_days'; specificDays = [...new Set(validIndices)]; } } 
        const parsedTime = parseTimeStr(fixTime); 
        const parsedDate = parseDateStr(fixDate); 
        
        let duration = parseInt(time);
        if (isNaN(duration)) duration = 60; // Default duration

        newGoals.push({ id: generateId(), title: name, categoryId: category.id, difficulty: (diff as Difficulty) || 'medium', deadline: dl, timing: duration, priority: (prio as Priority) || 'medium', repetitionOverride: finalRep, repeatSpecificDays: specificDays.length > 0 ? specificDays : undefined, fixedDate: parsedDate || undefined, fixedTime: parsedTime || undefined, subgoals: [], completed: false, createdAt: Date.now(), wasStarted: false }); 
      }); 
      
      setData(prev => ({ ...prev, goals: [...(prev.goals || []), ...newGoals], rewardBlocks: [...prev.rewardBlocks, ...newRewards] })); 
      setBulkText(''); 
      alert(`Imported ${newGoals.length} goals and ${newRewards.length} rewards successfully.`); 
    };
    const handleSubmit = () => { if (!title || !deadline) return alert('Title and Deadline required'); const goalData: Goal = { id: editingId || generateId(), title, categoryId: catId, difficulty, deadline, priority, repetitionOverride: repetition, repeatSpecificDays: repetition === 'specific_days' ? selectedDays : undefined, fixedTime: fixedTime || undefined, fixedDate: fixedDate || undefined, subgoals, completed: false, createdAt: editingId ? (data.goals.find(g => g.id === editingId)?.createdAt || Date.now()) : Date.now(), wasStarted: false, lastCompletedAt: editingId ? data.goals.find(g => g.id === editingId)?.lastCompletedAt : undefined }; if (editingId) { setData(prev => ({ ...prev, goals: (prev.goals || []).map(g => g.id === editingId ? goalData : g) })); alert('Goal Updated!'); setEditingId(null); } else { setData(prev => ({ ...prev, goals: [...(prev.goals || []), goalData] })); alert('Goal Added!'); } setTitle(''); setSubgoals([]); setFixedTime(''); setFixedDate(''); setSelectedDays([]); };
    return (
      <div className="space-y-6 pb-24"><div className="flex bg-gray-100 p-1 rounded-lg"><button onClick={() => setMode('create')} className={`flex-1 py-2 text-sm font-bold rounded-md ${mode === 'create' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>{editingId ? 'Edit Goal' : 'Create Goal'}</button><button onClick={() => setMode('list')} className={`flex-1 py-2 text-sm font-bold rounded-md ${mode === 'list' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Manage Goals</button></div>
        {mode === 'create' ? (<div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in">{!editingId && (<div className="flex space-x-4 mb-4 border-b pb-2"><button onClick={() => setCreateModeType('visual')} className={`text-sm font-bold pb-2 ${createModeType === 'visual' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}>Visual Builder</button><button onClick={() => setCreateModeType('bulk')} className={`text-sm font-bold pb-2 ${createModeType === 'bulk' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}>Bulk Import</button></div>)}{createModeType === 'bulk' && !editingId ? (<div className="space-y-4"><div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-xs text-yellow-800 font-mono"><p className="font-bold mb-2">Format:</p><p className="mb-2">[Name, Category, Difficulty, Deadline, Duration, Priority, Repetition, FixedDate(opt), FixedTime(opt)]</p><p className="font-bold mb-1">Repetition:</p><p>once, daily, weekly, Mon|Wed</p><p className="font-bold mt-2 mb-1">Rewards:</p><p>[Reward, "Gym", 2025-12-01 06:00, 2025-12-01 07:00, daily]</p><p className="font-bold mt-2 mb-1">Hobbies:</p><p>[Hobby, "Guitar", medium, 2026-01-01, 45, weekly]</p></div><textarea value={bulkText} onChange={e => setBulkText(e.target.value)} className="w-full h-48 p-4 bg-gray-50 rounded-xl font-mono text-sm border-2 border-dashed border-gray-200 focus:border-blue-500 focus:outline-none" placeholder="[Test Task, Work, hard, 2024-12-01, 120, critical, Mon|Wed, , 03:50 PM]" /><button onClick={handleBulkSubmit} className="w-full bg-green-600 text-white py-4 rounded-xl font-bold shadow-lg">Process Import</button></div>) : (<><h2 className="text-lg font-bold">{editingId ? 'Edit Goal' : 'Create Goal'}</h2><input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg" placeholder="Goal Title" /><div className="grid grid-cols-2 gap-4"><select value={catId} onChange={e => setCatId(e.target.value)} className="p-3 bg-gray-50 rounded-lg">{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={priority} onChange={e => setPriority(e.target.value as Priority)} className="p-3 bg-gray-50 rounded-lg"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-gray-400 uppercase">Deadline</label><input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg" /></div><div><label className="text-xs font-bold text-gray-400 uppercase">Difficulty</label><select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} className="w-full p-3 bg-gray-50 rounded-lg"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div></div><div><label className="block text-xs font-bold text-gray-400 uppercase mb-1">Repetition</label><select value={repetition} onChange={e => setRepetition(e.target.value as Repetition)} className="w-full p-3 bg-gray-50 rounded-lg"><option value="once">Once</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="weekly">Weekly</option><option value="specific_days">Specific Days</option></select>{repetition === 'specific_days' && (<div className="mt-3 flex justify-between px-1">{DAYS_SHORT.map((day, idx) => (<button key={idx} onClick={() => toggleDay(idx)} className={`w-10 h-10 rounded-full font-bold text-sm flex items-center justify-center transition-all ${selectedDays.includes(idx) ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-100 text-gray-400'}`}>{day}</button>))}</div>)}</div><div className="bg-purple-50 p-4 rounded-lg border border-purple-100"><h3 className="text-sm font-bold text-purple-800 mb-2 flex items-center"><Calendar className="w-4 h-4 mr-1"/> Strict Scheduling</h3><div className="grid grid-cols-2 gap-4"><input type="date" value={fixedDate} onChange={e => setFixedDate(e.target.value)} className="w-full p-2 bg-white rounded" /><input type="time" value={fixedTime} onChange={e => setFixedTime(e.target.value)} className="w-full p-2 bg-white rounded" /></div></div><div className="border-t pt-4"><label className="block text-xs font-bold text-gray-500 uppercase mb-2">Subgoals</label><div className="space-y-2 mb-2">
    <input 
        value={subgoalText} 
        onChange={e => setSubgoalText(e.target.value)} 
        className="w-full p-2 bg-gray-50 rounded-lg text-sm border-none focus:ring-2 focus:ring-blue-100 transition-all" 
        placeholder="Step name..." 
    />
    <div className="flex space-x-2">
        <div className="relative">
            <input 
                type="number" 
                value={subgoalTime} 
                onChange={e => setSubgoalTime(parseInt(e.target.value))} 
                className="w-20 p-2 bg-gray-50 rounded-lg text-sm text-center font-mono" 
                placeholder="Mins" 
            />
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">m</span>
        </div>
        <select 
            value={subgoalDiff} 
            onChange={e => setSubgoalDiff(e.target.value as Difficulty)} 
            className="flex-1 p-2 bg-gray-50 rounded-lg text-sm"
        >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
        </select>
        <button 
            onClick={addSubgoal} 
            className="bg-blue-100 text-blue-600 px-5 rounded-lg font-bold text-sm shrink-0 hover:bg-blue-200 transition-colors"
        >
            Add
        </button>
    </div>
</div><ul className="space-y-2 mt-2">{subgoals.map(sg => (<li key={sg.id} className="text-sm bg-gray-50 px-3 py-2 rounded flex justify-between items-center"><span>{sg.title}</span><button onClick={() => setSubgoals(subgoals.filter(s => s.id !== sg.id))}><X className="w-4 h-4 text-gray-400"/></button></li>))}</ul></div><button onClick={handleSubmit} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg">{editingId ? 'Update' : 'Create'}</button></>)}</div>) : (<div className="space-y-4 animate-in fade-in">{(data.goals || []).length === 0 ? <div className="text-center py-10 text-gray-400">No goals.</div> : (data.goals || []).map(goal => (<div key={goal.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center"><div><h3 className="font-bold text-gray-800">{goal.title}</h3><div className="text-xs text-gray-500 mt-1">{goal.deadline}</div></div><div className="flex space-x-2"><button onClick={() => loadGoalForEdit(goal)} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Edit2 className="w-4 h-4"/></button><button onClick={() => setData(prev => ({...prev, goals: prev.goals.filter(g => g.id !== goal.id)}))} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4"/></button></div></div>))}</div>)}</div>
    );
  };

  const CategoriesView = () => { /* ... same ... */ const [name, setName] = useState(''); const [color, setColor] = useState('#3b82f6'); const addCategory = () => { if (!name) return; setData(prev => ({ ...prev, categories: [...prev.categories, { id: generateId(), name, color, defaultRepetition: 'weekdays' }] })); setName(''); }; return (<div className="space-y-6 pb-24"><h2 className="text-2xl font-bold text-gray-800">Your Categories</h2><div className="grid grid-cols-2 md:grid-cols-3 gap-4">{data.categories.map(cat => (<div key={cat.id} className="relative p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-24 overflow-hidden group"><div className="absolute inset-0 opacity-10" style={{ backgroundColor: cat.color }}></div><span className="font-bold text-gray-700 relative z-10">{cat.name}</span><div className="flex justify-between items-end relative z-10"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} /><button onClick={() => setData(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== cat.id) }))} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4" /></button></div></div>))}<div className="p-4 rounded-xl border-2 border-dashed border-gray-300 flex flex-col justify-center items-center space-y-2"><input value={name} onChange={e => setName(e.target.value)} className="w-full text-center bg-transparent text-sm focus:outline-none" placeholder="New Category" /><div className="flex items-center space-x-2"><input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-6 h-6 rounded-full overflow-hidden border-none" /><button onClick={addCategory} className="bg-gray-800 text-white rounded-full p-1"><Plus className="w-4 h-4"/></button></div></div></div></div>); };
const HabitsView = () => {
    const [name, setName] = useState('');
    const [type, setType] = useState<'good' | 'bad'>('good');

    const addHabit = () => {
        if (!name.trim()) return;
        const newHabit: Habit = {
            id: generateId(),
            title: name,
            type: type,
            frequency: 'daily',
            lastEvent: type === 'good' ? 0 : Date.now(), // Good starts empty, Bad starts "clean" from now
            createdAt: Date.now()
        };
        setData(prev => ({ ...prev, habits: [...prev.habits, newHabit] }));
        setName('');
    };

    const handleAction = (habit: Habit) => {
        const isBad = habit.type === 'bad';
        if (isBad && !confirm("Reset your streak for this habit?")) return;
        
        // Good habits gain points, Bad habits generate debt
        const debt = isBad ? 50 : 0;
        const gain = isBad ? 0 : 10;

        const newLog: TaskLog = {
            id: generateId(),
            goalId: habit.id,
            categoryId: 'habit',
            action: isBad ? 'relapse' : 'habit_done',
            timestamp: Date.now(),
            hourOfDay: new Date().getHours(),
            debtGenerated: debt,
            gainGenerated: gain
        };

        setData(prev => ({
            ...prev,
            debt: prev.debt + debt,
            gain: prev.gain + gain,
            logs: [newLog, ...prev.logs],
            habits: prev.habits.map(h => h.id === habit.id ? { ...h, lastEvent: Date.now() } : h)
        }));
    };

    const deleteHabit = (id: string) => {
        if(confirm("Delete this tracker?")) {
            setData(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== id) }));
        }
    };

    // Helper to calc streak for good habits (Consecutive days)
    const getGoodStreak = (habitId: string) => {
        const logs = data.logs.filter(l => l.goalId === habitId && l.action === 'habit_done').map(l => new Date(l.timestamp).setHours(0,0,0,0));
        const uniqueDates = [...new Set(logs)].sort((a,b) => b - a);
        if (uniqueDates.length === 0) return 0;
        
        const today = new Date().setHours(0,0,0,0);
        const yesterday = today - 86400000;
        
        // If not done today or yesterday, streak is broken
        if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0;

        let streak = 1;
        for (let i = 0; i < uniqueDates.length - 1; i++) {
            if (uniqueDates[i] - uniqueDates[i+1] === 86400000) streak++;
            else break;
        }
        return streak;
    };

    return (
        <div className="space-y-6 pb-24 animate-in fade-in">
            <h2 className="text-2xl font-black text-gray-800">Habit Tracker</h2>

            {/* OVERALL HEATMAP */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center">
                    <TrendingUp className="w-4 h-4 mr-2" /> Net Performance (90 Days)
                </h3>
                <div className="flex flex-wrap gap-1 justify-center">
                    {Array.from({ length: 90 }).map((_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() - (89 - i));
                        const dateStr = d.toISOString().split('T')[0];
                        
                        // Calculate Net Score for Day
                        const dailyLogs = data.logs.filter(l => new Date(l.timestamp).toISOString().split('T')[0] === dateStr);
                        const goodCount = dailyLogs.filter(l => l.action === 'habit_done').length;
                        const badCount = dailyLogs.filter(l => l.action === 'relapse').length;
                        const netScore = goodCount - badCount;

                        let color = "bg-gray-100";
                        if (netScore > 0) color = netScore > 2 ? "bg-green-500" : "bg-green-300";
                        if (netScore < 0) color = netScore < -1 ? "bg-red-500" : "bg-red-300";
                        if (netScore === 0 && (goodCount > 0 || badCount > 0)) color = "bg-gray-400"; // Neutral active day

                        return <div key={i} title={`${dateStr}: +${goodCount} / -${badCount}`} className={`w-3 h-3 rounded-sm ${color}`} />
                    })}
                </div>
                <div className="flex justify-between items-center mt-2 px-2">
                    <span className="text-[10px] text-gray-400">3 Months ago</span>
                    <div className="flex space-x-2">
                        <span className="flex items-center text-[10px] text-gray-400"><div className="w-2 h-2 bg-green-500 mr-1 rounded-sm"/> Good Day</span>
                        <span className="flex items-center text-[10px] text-gray-400"><div className="w-2 h-2 bg-red-500 mr-1 rounded-sm"/> Bad Day</span>
                    </div>
                </div>
            </div>
            
            {/* Input */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3">
                <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setType('good')} className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${type === 'good' ? 'bg-white shadow text-green-600' : 'text-gray-500'}`}>Good Habit</button>
                    <button onClick={() => setType('bad')} className={`flex-1 py-2 rounded-md text-xs font-bold transition-all ${type === 'bad' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>Bad Habit</button>
                </div>
                <div className="flex space-x-2">
                    <input 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        placeholder={type === 'good' ? "e.g. Read 10 pages..." : "e.g. Smoking..."}
                        className="flex-1 bg-gray-50 p-3 rounded-lg font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button onClick={addHabit} className="bg-gray-900 text-white px-4 rounded-lg font-bold"><Plus className="w-5 h-5" /></button>
                </div>
            </div>

            {/* Habits List */}
            <div className="space-y-4">
                {data.habits.map(habit => {
                    const isBad = habit.type === 'bad';
                    
                    // Calc Streak
                    let streakDisplay = '';
                    if (isBad) {
                        const daysClean = Math.floor((Date.now() - habit.lastEvent) / (1000 * 60 * 60 * 24));
                        streakDisplay = `${daysClean} Days Clean`;
                    } else {
                        const streak = getGoodStreak(habit.id);
                        streakDisplay = `${streak} Day Streak`;
                    }

                    return (
                        <div key={habit.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-5 flex justify-between items-center">
                                <div>
                                    <div className="flex items-center space-x-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${isBad ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                            {isBad ? 'Break' : 'Build'}
                                        </span>
                                        <h3 className="text-xl font-bold text-gray-800">{habit.title}</h3>
                                    </div>
                                    <div className="text-2xl font-black text-gray-800 mt-1">{streakDisplay}</div>
                                </div>
                                <div className="flex space-x-2">
                                    <button 
                                        onClick={() => handleAction(habit)} 
                                        className={`px-4 py-3 rounded-xl font-bold text-sm border transition-colors flex flex-col items-center ${isBad ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'}`}
                                    >
                                        {isBad ? <AlertTriangle className="w-5 h-5 mb-1"/> : <CheckCircle className="w-5 h-5 mb-1"/>}
                                        {isBad ? 'Relapsed' : 'I Did It'}
                                    </button>
                                    <button onClick={() => deleteHabit(habit.id)} className="text-gray-300 hover:text-red-400 p-2"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>

                            {/* --- INDIVIDUAL HABIT HEATMAP --- */}
                            <div className="bg-gray-50 p-4 border-t border-gray-100">
                                <div className="flex flex-wrap gap-1 content-start">
                                    {Array.from({ length: 90 }).map((_, i) => {
                                        const d = new Date();
                                        d.setDate(d.getDate() - (89 - i));
                                        const dateStr = d.toISOString().split('T')[0];
                                        
                                        // Check logs for this specific habit on this day
                                        const dayLogs = data.logs.filter(l => 
                                            l.goalId === habit.id && 
                                            new Date(l.timestamp).toISOString().split('T')[0] === dateStr
                                        );

                                        let color = "bg-gray-200";
                                        
                                        if (isBad) {
                                            // Bad Habit: Red if relapse, Green if clean (post-creation)
                                            const relapsed = dayLogs.some(l => l.action === 'relapse');
                                            // Only show "Green/Clean" if the day is AFTER the habit was created
                                            if (d.getTime() >= new Date(habit.createdAt).setHours(0,0,0,0)) {
                                                color = relapsed ? "bg-red-500" : "bg-green-400";
                                            }
                                        } else {
                                            // Good Habit: Green if done
                                            const done = dayLogs.some(l => l.action === 'habit_done');
                                            if (done) color = "bg-green-500";
                                        }

                                        return <div key={i} title={dateStr} className={`w-2 h-2 rounded-sm ${color}`} />
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {data.habits.length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                        <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No habits tracked yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
  };
  const SettingsView = () => { const fileInputRef = useRef<HTMLInputElement>(null); const exportData = () => { const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `timeflow_backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); }; const importData = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const parsed = JSON.parse(event.target?.result as string); setData(sanitizeUserData(parsed)); alert('Data imported successfully!'); } catch (err) { alert('Failed to parse JSON'); } }; reader.readAsText(file); }; const clearOldHistory = () => { const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); setData(prev => ({ ...prev, logs: prev.logs.filter(l => l.timestamp > thirtyDaysAgo) })); alert("History older than 30 days has been cleared."); }; 
  // Reward Schedule UI
  const [newRewardDate, setNewRewardDate] = useState(''); const [newRewardStart, setNewRewardStart] = useState(''); const [newRewardEnd, setNewRewardEnd] = useState(''); const [newRewardLabel, setNewRewardLabel] = useState('');
  const [newRewardRepetition, setNewRewardRepetition] = useState<Repetition>('once'); const [newRewardDays, setNewRewardDays] = useState<number[]>([]);
  const addRewardBlock = () => { 
      if(!newRewardDate || !newRewardStart || !newRewardEnd || !newRewardLabel) return alert("Fill all fields");
      const start = new Date(`${newRewardDate}T${newRewardStart}`); const end = new Date(`${newRewardDate}T${newRewardEnd}`);
      if(end <= start) return alert("End time must be after start");
      const newBlock: RewardBlock = { 
          id: generateId(), startTime: start.getTime(), endTime: end.getTime(), label: newRewardLabel,
          repetition: newRewardRepetition, repeatSpecificDays: newRewardRepetition === 'specific_days' ? newRewardDays : []
      };
      setData(prev => ({ ...prev, rewardBlocks: [...prev.rewardBlocks, newBlock] }));
      setNewRewardDate(''); setNewRewardStart(''); setNewRewardEnd(''); setNewRewardLabel(''); setNewRewardRepetition('once'); setNewRewardDays([]);
  };
  const toggleRewardDay = (dayIdx: number) => { setNewRewardDays(prev => prev.includes(dayIdx) ? prev.filter(d => d !== dayIdx) : [...prev, dayIdx]); };
  
  return (<div className="space-y-6 pb-24"><h2 className="text-2xl font-bold text-gray-800">Settings</h2><div className="bg-orange-50 p-4 rounded-xl shadow-sm border border-orange-100 space-y-4"><h3 className="font-bold text-orange-800 flex items-center"><FastForward className="w-4 h-4 mr-2" /> Developer / Test Mode</h3><div><label className="text-xs text-orange-600 block mb-1">Simulate Day</label><select value={data.settings.simulatedDay ?? ''} onChange={e => setData(prev => ({...prev, settings: {...prev.settings, simulatedDay: e.target.value ? parseInt(e.target.value) : undefined}}))} className="w-full p-2 bg-white rounded border border-orange-200 text-sm"><option value="">Off (Use Real Date)</option>{DAYS_FULL.map((d, i) => <option key={i} value={i}>Simulate {d}</option>)}</select></div><div><label className="text-xs text-orange-600 block mb-1">Simulate Hour (0-23)</label><input type="number" placeholder="Current Hour Override (e.g. 14 for 2PM)" value={data.settings.simulatedHour ?? ''} onChange={e => setData(prev => ({...prev, settings: {...prev.settings, simulatedHour: e.target.value ? parseInt(e.target.value) : undefined}}))} className="w-full p-2 bg-white rounded border border-orange-200 text-sm" /></div></div><div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-700">Notifications</h3>
            <p className="text-xs text-gray-500">Get alerted 30m before tasks</p>
<button 
    onClick={() => {
        if (!("Notification" in window)) {
            alert("Error: This browser does not support notifications.");
            return;
        }
        alert(`Current Status: ${Notification.permission}\nClick OK to request permission...`);
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
                try {
                    new Notification("Test Success!", { body: "If you see this, it works!", icon: '/favicon.ico' });
                    // Fallback for some mobile browsers that swallow notifications
                    navigator.vibrate?.([200, 100, 200]); 
                } catch (e) {
                    alert("Permission granted, but sending failed. (Mobile browsers often require a Service Worker for this).");
                }
            } else {
                alert(`Permission was ${perm}. Go to your Browser Settings -> Site Settings -> Notifications and allow this site.`);
            }
        });
    }}
    className="text-xs text-blue-600 font-bold underline mt-1 block"
>
    Test Mobile Notification
</button>
          </div>
          <button 
            onClick={() => {
              if (Notification.permission !== 'granted') Notification.requestPermission();
              setData(prev => ({
                ...prev, 
                settings: { ...prev.settings, allowNotifications: !prev.settings.allowNotifications }
              }));
            }}
            className={`w-12 h-6 rounded-full transition-colors relative ${data.settings.allowNotifications ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${data.settings.allowNotifications ? 'left-7' : 'left-1'}`} />
          </button>
      </div><div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-700">Dark Mode</h3>
            <p className="text-xs text-gray-500">Easier on the eyes</p>
          </div>
          <button 
            onClick={() => setData(prev => ({
                ...prev, 
                settings: { ...prev.settings, darkMode: !prev.settings.darkMode }
              }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${data.settings.darkMode ? 'bg-indigo-600' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${data.settings.darkMode ? 'left-7' : 'left-1'}`} />
          </button>
      </div><div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4"><h3 className="font-bold text-gray-600 border-b pb-2">Working Hours</h3><div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-gray-400">Start (24h)</label><input type="number" value={data.settings.workStartHour} onChange={e => setData(p => ({...p, settings: {...p.settings, workStartHour: parseInt(e.target.value)}}))} className="w-full p-2 bg-gray-50 rounded" /></div><div><label className="text-xs text-gray-400">End (24h)</label><input type="number" value={data.settings.workEndHour} onChange={e => setData(p => ({...p, settings: {...p.settings, workEndHour: parseInt(e.target.value)}}))} className="w-full p-2 bg-gray-50 rounded" /></div></div></div>{/* Energy Settings */}<div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4"><h3 className="font-bold text-gray-600 border-b pb-2">Peak Energy Hours</h3><div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-gray-400">Peak Start (24h)</label><input type="number" value={data.settings.peakStartHour} onChange={e => setData(p => ({...p, settings: {...p.settings, peakStartHour: parseInt(e.target.value)}}))} className="w-full p-2 bg-gray-50 rounded" /></div><div><label className="text-xs text-gray-400">Peak End (24h)</label><input type="number" value={data.settings.peakEndHour} onChange={e => setData(p => ({...p, settings: {...p.settings, peakEndHour: parseInt(e.target.value)}}))} className="w-full p-2 bg-gray-50 rounded" /></div></div></div>
    {/* Reward Schedule */}
    <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-4"><h3 className="font-bold text-purple-800 flex items-center"><Gift className="w-4 h-4 mr-2" /> Reward Schedule</h3><div className="grid grid-cols-2 gap-2"><input type="date" value={newRewardDate} onChange={e => setNewRewardDate(e.target.value)} className="w-full p-2 bg-white rounded text-sm" /><input type="text" value={newRewardLabel} onChange={e => setNewRewardLabel(e.target.value)} className="w-full p-2 bg-white rounded text-sm" placeholder="Activity" /></div><div className="grid grid-cols-2 gap-2"><input type="time" value={newRewardStart} onChange={e => setNewRewardStart(e.target.value)} className="w-full p-2 bg-white rounded text-sm" /><input type="time" value={newRewardEnd} onChange={e => setNewRewardEnd(e.target.value)} className="w-full p-2 bg-white rounded text-sm" /></div><div className="mt-2"><label className="block text-xs text-purple-700 mb-1 font-bold">Repetition</label><select value={newRewardRepetition} onChange={e => setNewRewardRepetition(e.target.value as Repetition)} className="w-full p-2 bg-white rounded text-sm mb-2"><option value="once">Once</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="weekly">Weekly</option><option value="specific_days">Specific Days</option></select>{newRewardRepetition === 'specific_days' && (<div className="flex justify-between px-1 mb-2">{DAYS_SHORT.map((day, idx) => (<button key={idx} onClick={() => toggleRewardDay(idx)} className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center transition-all ${newRewardDays.includes(idx) ? 'bg-purple-600 text-white' : 'bg-white text-purple-300'}`}>{day}</button>))}</div>)}</div><button onClick={addRewardBlock} className="w-full bg-purple-600 text-white py-2 rounded text-sm font-bold">Add Reward Block</button><div className="space-y-2 mt-2">{data.rewardBlocks.map(b => (<div key={b.id} className="flex justify-between items-center bg-white p-2 rounded text-xs"><span>{new Date(b.startTime).toLocaleDateString()} {new Date(b.startTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} - {new Date(b.endTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}: {b.label} ({b.repetition})</span><button onClick={() => setData(prev => ({...prev, rewardBlocks: prev.rewardBlocks.filter(rb => rb.id !== b.id)}))}><X className="w-3 h-3 text-red-400"/></button></div>))}</div></div><div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4"><h3 className="font-bold text-gray-600 border-b pb-2">Data Management</h3><div className="flex space-x-3"><button onClick={exportData} className="flex-1 bg-blue-50 text-blue-600 py-3 rounded-lg flex items-center justify-center font-medium">Download</button><button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-orange-50 text-orange-600 py-3 rounded-lg flex items-center justify-center font-medium">Import</button><input type="file" ref={fileInputRef} onChange={importData} className="hidden" accept=".json" /></div><button onClick={clearOldHistory} className="w-full bg-red-50 text-red-600 py-3 rounded-lg font-bold mt-2">Clear Old History (30+ Days)</button></div></div>); };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex justify-center">
      {showConfetti && <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden"><div className="absolute animate-bounce text-6xl">🎉</div></div>}
      {jackpotTriggered && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in"><div className="bg-yellow-400 p-8 rounded-3xl shadow-2xl text-center transform animate-bounce"><Trophy className="w-20 h-20 mx-auto text-white mb-4 drop-shadow-md" /><h1 className="text-4xl font-black text-white uppercase tracking-wider drop-shadow-md">Jackpot!</h1><p className="text-yellow-800 font-bold mt-2">+1000 GAIN</p></div></div>}

      <div className="fixed inset-0 w-full max-w-md mx-auto bg-white shadow-2xl overflow-hidden flex flex-col">
        <header className="px-6 py-5 bg-white z-10 flex justify-between items-center shrink-0">
          <div><h1 className="text-2xl font-black text-gray-800 tracking-tight">TimeFlow</h1><p className="text-xs text-gray-400 font-medium">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">{(data.goals || []).filter(g => !g.completed).length}</div>
        </header>

        <main className="flex-1 px-6 pt-4 overflow-y-auto scrollbar-hide">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'goals' && <GoalManager />}
{activeTab === 'habits' && <HabitsView />}
          {activeTab === 'categories' && <CategoriesView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>

        <nav className="w-full bg-white border-t border-gray-100 px-6 py-4 flex justify-between items-center z-20 pb-safe shrink-0">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center space-y-1 ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}><Clock className="w-6 h-6" /><span className="text-[10px] font-bold uppercase">Flow</span></button>
          <button onClick={() => setActiveTab('goals')} className={`flex flex-col items-center space-y-1 ${activeTab === 'goals' ? 'text-blue-600' : 'text-gray-400'}`}><List className="w-6 h-6" /><span className="text-[10px] font-bold uppercase">Goals</span></button>
<button onClick={() => setActiveTab('habits')} className={`flex flex-col items-center space-y-1 ${activeTab === 'habits' ? 'text-purple-600' : 'text-gray-400'}`}>
    <TrendingUp className="w-6 h-6" />
    <span className="text-[10px] font-bold uppercase">Habits</span>
</button>
          <button onClick={() => setActiveTab('categories')} className={`flex flex-col items-center space-y-1 ${activeTab === 'categories' ? 'text-blue-600' : 'text-gray-400'}`}><BarChart2 className="w-6 h-6" /><span className="text-[10px] font-bold uppercase">Cats</span></button>
          <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center space-y-1 ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-400'}`}><Settings className="w-6 h-6" /><span className="text-[10px] font-bold uppercase">Setup</span></button>
        </nav>
      </div>
      <div className="hidden lg:block fixed left-10 top-1/2 -translate-y-1/2 w-64 text-gray-400 text-sm"><h3 className="font-bold text-gray-600 mb-2">PWA Enabled</h3><p>This app uses LocalStorage and mobile viewports. Install via Chrome to remove the address bar and use offline.</p></div>
    </div>
  );
}