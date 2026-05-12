import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

// ─── Dashboard ────────────────────────────────

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/reports/dashboard');
      return data.data as DashboardData;
    },
    refetchInterval: 60_000, // Refresh every minute
  });
}

// ─── Students ─────────────────────────────────

export interface StudentFilters {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useStudents(filters: StudentFilters = {}) {
  return useQuery({
    queryKey: ['students', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.search) params.set('search', filters.search);
      if (filters.page)   params.set('page', String(filters.page));
      if (filters.limit)  params.set('limit', String(filters.limit));
      const { data } = await api.get(`/students?${params}`);
      return data as { data: Student[]; meta: PaginationMeta };
    },
  });
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: async () => {
      const { data } = await api.get(`/students/${id}`);
      return data.data as StudentDetail;
    },
    enabled: Boolean(id),
  });
}

export function useActivateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, scheduleId, teacherId }: { id: string; scheduleId: string; teacherId?: string }) => {
      const { data } = await api.post(`/students/${id}/activate`, { scheduleId, teacherId });
      return data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useSuspendStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/students/${id}/suspend`);
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['student', id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Payments ─────────────────────────────────

export function useStudentPayments(studentId: string) {
  return useQuery({
    queryKey: ['payments', studentId],
    queryFn: async () => {
      const { data } = await api.get(`/payments/student/${studentId}`);
      return data.data as Payment[];
    },
    enabled: Boolean(studentId),
  });
}

export function useRegisterEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (studentId: string) => {
      const { data } = await api.post('/payments/enrollment', { studentId });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useRegisterMonthly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { studentId: string; period: string; amount?: number; notes?: string }) => {
      const { data } = await api.post('/payments/monthly', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Schedules ────────────────────────────────

export function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const { data } = await api.get('/schedules');
      return data.data as Schedule[];
    },
  });
}

// ─── Teachers ─────────────────────────────────

export function useTeachers() {
  return useQuery({
    queryKey: ['teachers'],
    queryFn: async () => {
      const { data } = await api.get('/teachers');
      return data.data as Teacher[];
    },
  });
}

export function useMyStudents() {
  return useQuery({
    queryKey: ['my-students'],
    queryFn: async () => {
      const { data } = await api.get('/teachers/my-students');
      return data.data as Student[];
    },
  });
}

// ─── Reports ─────────────────────────────────

export function useFinancialReport(from: string, to: string) {
  return useQuery({
    queryKey: ['report', 'financial', from, to],
    queryFn: async () => {
      const { data } = await api.get(`/reports/financial?from=${from}&to=${to}`);
      return data.data as FinancialReport;
    },
  });
}

// ─── Types ───────────────────────────────────

export interface DashboardData {
  students: { total: number; active: number; delinquent: number; suspended: number };
  revenue: { monthly: number; yearly: number };
  schedules: ScheduleOccupancy[];
  recentPayments: RecentPayment[];
  generatedAt: string;
}

export interface ScheduleOccupancy {
  id: string;
  dayOfWeek: number;
  startTime: string;
  modality: string;
  capacity: number;
  occupied: number;
  waitingCount: number;
  occupancyPct: number;
}

export interface Student {
  id: string;
  phone: string;
  name: string;
  status: string;
  modality: string;
  createdAt: string;
  teacher?: { user: { name: string } };
  payments?: Payment[];
  scheduleSlots?: { schedule: { dayOfWeek: number; startTime: string; modality: { name: string } } }[];
}

export interface StudentDetail extends Student {
  regulationAcceptedAt?: string;
  regulationVersion?: string;
  enrollmentPaidAt?: string;
  enrollmentExpiresAt?: string;
  notes?: string;
}

export interface Payment {
  id: string;
  type: string;
  status: string;
  amount: string;
  period?: string;
  confirmedAt?: string;
  notes?: string;
  student?: { name: string };
}

export interface RecentPayment extends Payment {
  student: { name: string };
}

export interface PaginationMeta {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface Schedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  modality: { name: string; maxCapacity: number; modality: string };
  slots: { student: { id: string; name: string; status: string }; teacher?: { user: { name: string } } }[];
  waitingList: unknown[];
}

export interface Teacher {
  id: string;
  displayName: string;
  phone: string;
  commissionPct: string;
  user: { name: string; email: string };
  students: { id: string; name: string; status: string }[];
}

export interface FinancialReport {
  payments: Payment[];
  total: number;
  from: string;
  to: string;
}
