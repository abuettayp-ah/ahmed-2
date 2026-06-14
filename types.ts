
export interface TimeGap {
  id: string; // معرف فريد للتعامل مع الواجهة
  start: Date;
  end: Date;
}

export interface DailyWindow {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string; // "HH:mm" format
  endTime: string; // "HH:mm" format
}

export interface AnnotationFilters {
  authors?: string[]; // Filter by authors
  dates?: string[];   // Filter by exact date strings (YYYY-MM-DD)
}

export interface DateModificationConfig {
  mode: 'fixed' | 'shift' | 'distribute' | 'custom_periods' | 'daily_recurring' | 'none';
  fixedDate?: Date;
  shiftHours?: number;
  startDate?: Date;
  endDate?: Date;
  gaps?: TimeGap[]; // قائمة الفجوات الزمنية (for distribute mode)
  customPeriods?: TimeGap[]; // الفترات المخصصة المسموحة
  dailyWindows?: DailyWindow[]; // النوافذ اليومية المتكررة
  filters?: AnnotationFilters; // فلاتر لتطبيق التعديلات على تعليقات محددة
  newAuthorName?: string; // اسم المؤلف الجديد (اختياري)
}

export type ProcessingStatus = 
  | { type: 'idle' }
  | { type: 'loading', message: string }
  | { type: 'success', message: string }
  | { type: 'error', message: string };

export interface AnnotationMeta {
  author: string;
  date: string;
}

export interface PdfMetadata {
  authors: string[];
  dates: string[]; // YYYY-MM-DD format
  annotations: AnnotationMeta[];
}
