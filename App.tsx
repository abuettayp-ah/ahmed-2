
import React, { useState, useCallback, useRef } from 'react';
import { Upload, Clock, Download, FileText, AlertCircle, CheckCircle, RefreshCw, Settings, ShieldCheck, ArrowRightLeft, CalendarRange, RotateCcw, Plus, Trash2, Ban, Filter } from 'lucide-react';
import { extractPdfMetadata, modifyPdfAnnotations } from './services/pdfService';
import { DateModificationConfig, ProcessingStatus, TimeGap, PdfMetadata, AnnotationFilters } from './types';

export default function App() {
  // Original file uploaded by user
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  
  // Current working buffer (allows sequential edits)
  const [currentPdfBuffer, setCurrentPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("");
  
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<ProcessingStatus>({ type: 'idle' });
  const [isDownloadingOffline, setIsDownloadingOffline] = useState(false);
  
  // Extracted Metadata
  const [metadata, setMetadata] = useState<PdfMetadata>({ authors: [], dates: [], annotations: [] });
  // Currently Settings for Filters
  const [filters, setFilters] = useState<AnnotationFilters>({ authors: [], dates: [] });
  const [newAuthorName, setNewAuthorName] = useState<string>('');

  const availableAuthors = React.useMemo(() => {
    if (!filters.dates || filters.dates.length === 0) return metadata.authors;
    const filteredAnnots = metadata.annotations.filter(a => filters.dates!.includes(a.date));
    return Array.from(new Set(filteredAnnots.map(a => a.author))).filter(Boolean).sort();
  }, [metadata, filters.dates]);

  const availableDates = React.useMemo(() => {
    if (!filters.authors || filters.authors.length === 0) return metadata.dates;
    const filteredAnnots = metadata.annotations.filter(a => filters.authors!.includes(a.author));
    return Array.from(new Set(filteredAnnots.map(a => a.date))).filter(Boolean).sort();
  }, [metadata, filters.authors]);

  
  // Settings State
  const [mode, setMode] = useState<'fixed' | 'shift' | 'distribute' | 'custom_periods' | 'daily_recurring' | 'none'>('none');
  
  // Fixed Mode State
  const [fixedDate, setFixedDate] = useState<string>(new Date().toISOString().slice(0, 16));
  
  // Shift Mode State
  const [shiftHours, setShiftHours] = useState<number>(0);

  // Distribute Mode State
  const [distributeStart, setDistributeStart] = useState<string>(new Date().toISOString().slice(0, 16));
  const [distributeEnd, setDistributeEnd] = useState<string>(
    new Date(Date.now() + 3600000).toISOString().slice(0, 16) // Default +1 hour
  );
  
  // Gaps State
  const [gaps, setGaps] = useState<TimeGap[]>([]);
  const [newGapStart, setNewGapStart] = useState<string>("");
  const [newGapEnd, setNewGapEnd] = useState<string>("");
  
  // Custom Periods State
  const [customPeriods, setCustomPeriods] = useState<TimeGap[]>([]);
  const [newPeriodStart, setNewPeriodStart] = useState<string>("");
  const [newPeriodEnd, setNewPeriodEnd] = useState<string>("");

  // Daily Recurring State
  const [dailyWindows, setDailyWindows] = useState<{id: string, startDate: string, endDate: string, startTime: string, endTime: string}[]>([]);
  const [newWindowStartDate, setNewWindowStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [newWindowEndDate, setNewWindowEndDate] = useState<string>(new Date(Date.now() + 86400000).toISOString().slice(0, 10)); // default +1 day
  const [newWindowStart, setNewWindowStart] = useState<string>("08:00");
  const [newWindowEnd, setNewWindowEnd] = useState<string>("14:00");

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const loadFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      setOriginalFile(file);
      setCurrentFileName(file.name);
      setCurrentPdfBuffer(buffer);
      
      // Extract metadata
      try {
        const meta = await extractPdfMetadata(buffer);
        setMetadata(meta);
      } catch (metaErr) {
        console.error("Failed to extract metadata", metaErr);
      }

      setStatus({ type: 'idle' });
    } catch (e) {
      setStatus({ type: 'error', message: 'فشل في قراءة الملف.' });
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        loadFile(droppedFile);
      } else {
        setStatus({ type: 'error', message: 'يرجى رفع ملف PDF فقط.' });
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        loadFile(selectedFile);
      } else {
        setStatus({ type: 'error', message: 'يرجى رفع ملف PDF فقط.' });
      }
    }
  };

  const addGap = () => {
    if (!newGapStart || !newGapEnd) return;
    const start = new Date(newGapStart);
    const end = new Date(newGapEnd);

    if (start >= end) {
      alert("يجب أن يكون وقت بداية الفجوة قبل وقت النهاية");
      return;
    }

    const newGap: TimeGap = {
      id: Math.random().toString(36).substr(2, 9),
      start,
      end
    };

    setGaps([...gaps, newGap]);
    setNewGapStart("");
    setNewGapEnd("");
  };

  const removeGap = (id: string) => {
    setGaps(gaps.filter(g => g.id !== id));
  };

  const addCustomPeriod = () => {
    if (!newPeriodStart || !newPeriodEnd) return;
    const start = new Date(newPeriodStart);
    const end = new Date(newPeriodEnd);

    if (start >= end) {
      alert("يجب أن يكون وقت بداية الفترة قبل وقت النهاية");
      return;
    }

    const newPeriod: TimeGap = {
      id: Math.random().toString(36).substr(2, 9),
      start,
      end
    };

    setCustomPeriods([...customPeriods, newPeriod]);
    setNewPeriodStart("");
    setNewPeriodEnd("");
  };

  const removeCustomPeriod = (id: string) => {
    setCustomPeriods(customPeriods.filter(g => g.id !== id));
  };

  const addDailyWindow = () => {
    if (!newWindowStart || !newWindowEnd || !newWindowStartDate || !newWindowEndDate) return;
    
    // basic validation
    if (newWindowStartDate > newWindowEndDate) {
      alert("تاريخ بداية النافذة يجب أن يكون قبل أو يساوي تاريخ النهاية");
      return;
    }
    if (newWindowStart >= newWindowEnd) {
      alert("وقت بداية النافذة يجب أن يكون قبل وقت النهاية");
      return;
    }

    setDailyWindows([...dailyWindows, {
      id: Math.random().toString(36).substr(2, 9),
      startDate: newWindowStartDate,
      endDate: newWindowEndDate,
      startTime: newWindowStart,
      endTime: newWindowEnd
    }]);
  };

  const removeDailyWindow = (id: string) => {
    setDailyWindows(dailyWindows.filter(w => w.id !== id));
  };

  const handleProcess = async () => {
    if (!currentPdfBuffer) return;

    setStatus({ type: 'loading', message: 'جاري معالجة الملف...' });

    // Use a small timeout to allow UI to update loading state
    setTimeout(async () => {
      try {
        const config: DateModificationConfig = {
          mode,
          fixedDate: mode === 'fixed' ? new Date(fixedDate) : undefined,
          shiftHours: mode === 'shift' ? Number(shiftHours) : undefined,
          startDate: mode === 'distribute' ? new Date(distributeStart) : undefined,
          endDate: mode === 'distribute' ? new Date(distributeEnd) : undefined,
          gaps: mode === 'distribute' ? gaps : undefined,
          customPeriods: mode === 'custom_periods' ? customPeriods : undefined,
          dailyWindows: mode === 'daily_recurring' ? dailyWindows : undefined,
          filters,
          newAuthorName: newAuthorName.trim() !== '' ? newAuthorName : undefined,
        };

        const { pdfBytes, count } = await modifyPdfAnnotations(currentPdfBuffer.slice(0), config);
        
        setCurrentPdfBuffer(pdfBytes.buffer);
        
        setStatus({ type: 'success', message: `تم تحديث ${count} تعليق. يمكنك تحميل الملف أو إجراء تعديل إضافي.` });
      } catch (error) {
        console.error(error);
        setStatus({ type: 'error', message: 'حدث خطأ أثناء معالجة الملف. تأكد من سلامة الملف.' });
      }
    }, 100);
  };

  const handleDownload = () => {
    if (!currentPdfBuffer) return;

    const blob = new Blob([currentPdfBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `modified_${currentFileName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetToOriginal = async () => {
    if (originalFile) {
      await loadFile(originalFile);
      setStatus({ type: 'idle' });
    }
  };

  const startOver = () => {
    setOriginalFile(null);
    setCurrentPdfBuffer(null);
    setCurrentFileName("");
    setStatus({ type: 'idle' });
    setMode('none');
    setFixedDate(new Date().toISOString().slice(0, 16));
    setShiftHours(0);
    setDistributeStart(new Date().toISOString().slice(0, 16));
    setDistributeEnd(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
    setGaps([]);
    setNewGapStart("");
    setNewGapEnd("");
    setCustomPeriods([]);
    setNewPeriodStart("");
    setNewPeriodEnd("");
    setNewWindowStartDate(new Date().toISOString().slice(0, 10));
    setNewWindowEndDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    setDailyWindows([]);
    setNewWindowStart("08:00");
    setNewWindowEnd("14:00");
    setMetadata({ authors: [], dates: [], annotations: [] });
    setFilters({ authors: [], dates: [] });
    setNewAuthorName('');
  };

  const clearFileKeepSettings = () => {
    setOriginalFile(null);
    setCurrentPdfBuffer(null);
    setCurrentFileName("");
    setStatus({ type: 'idle' });
    setMetadata({ authors: [], dates: [], annotations: [] });
    // We intentionally keep filters/settings
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary-100 p-2 rounded-lg text-primary-600">
              <Clock size={24} />
            </div>
            <h1 className="text-xl font-bold text-gray-800">معدل توقيت PDF</h1>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
              <ShieldCheck size={16} className="text-primary-500" />
              <span>آمن ويعمل محلياً</span>
            </div>
            <button 
              onClick={async () => {
                if (isDownloadingOffline) return;
                setIsDownloadingOffline(true);
                try {
                  const res = await fetch('/offline-app.html');
                  const text = await res.text();
                  const blob = new Blob([text], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'pdf-time-editor-offline.html';
                  a.click();
                  URL.revokeObjectURL(url);
                } catch(e) {
                  console.error(e);
                  alert('حدث خطأ أثناء تحميل الملف');
                } finally {
                  setIsDownloadingOffline(false);
                }
              }}
              className="flex items-center gap-2 text-sm bg-primary-600 hover:bg-primary-700 text-white px-4 py-1.5 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isDownloadingOffline}
            >
              <Download size={16} />
              <span>{isDownloadingOffline ? 'جاري التجهيز...' : 'تنزيل التطبيق لجهازك'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Intro */}
        <div className="mb-8 text-center sm:text-right">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">تعديل تواريخ التعليقات</h2>
          <p className="text-gray-600 max-w-3xl text-lg">
            أداة شاملة لتوحيد، إزاحة، أو توزيع توقيت التعليقات زمنياً. يمكنك إجراء تعديلات متعددة متتالية على نفس الملف بكل سهولة.
          </p>
        </div>

        {/* Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Upload Area & Preview (Takes up 7/12) */}
          <div className="lg:col-span-7 space-y-6">
            {!currentPdfBuffer ? (
              <div 
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`
                  relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ease-in-out cursor-pointer group h-80 flex flex-col justify-center items-center
                  ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-white bg-white'}
                `}
              >
                <input 
                  type="file" 
                  accept="application/pdf" 
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center pointer-events-none">
                  <div className={`p-4 rounded-full mb-4 transition-colors ${isDragging ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-400 group-hover:bg-primary-50 group-hover:text-primary-500'}`}>
                    <Upload size={40} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">اسحب الملف هنا أو اضغط للاختيار</h3>
                  <p className="text-gray-500">يدعم ملفات PDF فقط</p>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                {/* File Info Header */}
                <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="bg-red-50 p-3 rounded-xl text-red-500">
                      <FileText size={32} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 truncate max-w-[200px] sm:max-w-md" title={currentFileName}>
                        {currentFileName}
                      </h3>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">
                           {originalFile ? (originalFile.size / 1024 / 1024).toFixed(2) : 0} ميجابايت
                        </span>
                        {/* Status Badge */}
                        {currentPdfBuffer.byteLength !== (originalFile?.size || 0) && (
                          <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">تم التعديل</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                     <button 
                        onClick={resetToOriginal}
                        className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
                        title="إلغاء التعديلات والعودة للملف الأصلي"
                      >
                        <RotateCcw size={16} />
                        استعادة الأصل
                      </button>
                      <button 
                        onClick={startOver}
                        className="text-red-500 hover:text-white hover:bg-red-500 px-3 py-2 rounded-lg transition-colors"
                        title="إغلاق الملف والبدء من جديد"
                      >
                        <Trash2 size={20} />
                      </button>
                  </div>
                </div>

                {/* Processing State Display */}
                {status.type === 'loading' ? (
                  <div className="flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-200 border-t-primary-600 mb-3"></div>
                    <p className="text-gray-600 font-medium">{status.message}</p>
                  </div>
                ) : status.type === 'error' ? (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3 text-red-700 mb-4">
                    <AlertCircle className="shrink-0 mt-0.5" size={20} />
                    <p>{status.message}</p>
                  </div>
                ) : status.type === 'success' ? (
                   <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4 flex items-start gap-3">
                      <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-green-800 font-medium mb-1">تمت العملية بنجاح!</p>
                        <p className="text-green-700 text-sm">{status.message}</p>
                      </div>
                   </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500 border border-dashed border-gray-200">
                    <Settings className="mx-auto mb-2 opacity-50" size={32} />
                    <p>اختر إعدادات التعديل من القائمة الجانبية ثم اضغط "تطبيق التعديلات"</p>
                  </div>
                )}
                
                {/* Actions Footer */}
                <div className="mt-6 flex flex-col gap-3 pt-4 border-t border-gray-100">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleProcess}
                      disabled={status.type === 'loading'}
                      className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold shadow-md shadow-primary-100 transition-all flex items-center justify-center gap-2"
                    >
                      {status.type === 'loading' ? 'جاري العمل...' : 'تطبيق التعديلات'}
                    </button>
                    
                    <button
                      onClick={handleDownload}
                      className="flex-1 bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Download size={20} />
                      تحميل الملف الحالي
                    </button>
                  </div>

                  {status.type === 'success' && (
                    <div className="flex flex-col sm:flex-row gap-3 pt-2 mt-2 border-t border-dashed border-gray-200">
                      <button
                        onClick={clearFileKeepSettings}
                        className="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                      >
                        <Upload size={16} />
                        إضافة ملف جديد بنفس الإعدادات
                      </button>
                      <button
                        onClick={startOver}
                        className="flex-1 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                      >
                        <RotateCcw size={16} />
                        ابدأ من جديد
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Settings Panel (Takes up 5/12) */}
          <div className="lg:col-span-5">
            <div className={`bg-white border border-gray-200 rounded-2xl p-6 shadow-sm sticky top-24 ${!currentPdfBuffer ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
              
              {/* Target Filters */}
              <div className="mb-6 border-b border-gray-100 pb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Filter size={20} className="text-primary-600" />
                  تصفية التعليقات المستهدفة
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">حسب المؤلف (يمكن اختيار أكثر من واحد)</label>
                    <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1">
                      {availableAuthors.length === 0 ? (
                         <p className="text-gray-500 text-sm p-1">لا يوجد مؤلفين متاحين</p>
                      ) : availableAuthors.map(author => {
                         const isSelected = (filters.authors || []).includes(author);
                         return (
                           <label key={author} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                             <input 
                               type="checkbox" 
                               checked={isSelected}
                               onChange={(e) => {
                                 const currentAuthors = filters.authors || [];
                                 if (e.target.checked) {
                                   setFilters({...filters, authors: [...currentAuthors, author]});
                                 } else {
                                   setFilters({...filters, authors: currentAuthors.filter(a => a !== author)});
                                 }
                               }} 
                               className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                             />
                             <span className="truncate">{author || 'بدون اسم'}</span>
                           </label>
                         );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">حسب التاريخ الأصلي (يمكن اختيار أكثر من واحد)</label>
                    <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2 space-y-1" dir="ltr">
                      {availableDates.length === 0 ? (
                         <p className="text-gray-500 text-sm p-1 text-right" dir="rtl">لا يوجد تواريخ متاحة</p>
                      ) : availableDates.map(date => {
                         const isSelected = (filters.dates || []).includes(date);
                         return (
                           <label key={date} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 p-1.5 rounded text-right" dir="rtl">
                             <input 
                               type="checkbox" 
                               checked={isSelected}
                               onChange={(e) => {
                                 const currentDates = filters.dates || [];
                                 if (e.target.checked) {
                                   setFilters({...filters, dates: [...currentDates, date]});
                                 } else {
                                   setFilters({...filters, dates: currentDates.filter(d => d !== date)});
                                 }
                               }} 
                               className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4 cursor-pointer"
                             />
                             <span dir="ltr">{date}</span>
                           </label>
                         );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Author Rename */}
              <div className="mb-6 border-b border-gray-100 pb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText size={20} className="text-primary-600" />
                  تعديل اسم المؤلف
                </h3>
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">اسم المؤلف الجديد (اختياري)</label>
                   <input
                     type="text"
                     value={newAuthorName}
                     onChange={(e) => setNewAuthorName(e.target.value)}
                     className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                     placeholder="اتركه فارغاً للاحتفاظ بالاسم الأصلي"
                   />
                   <p className="text-xs text-gray-500 mt-1">سيتم تطبيقه على التعليقات المستهدفة.</p>
                </div>
              </div>

              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2 border-b border-gray-100 pb-4">
                <Settings size={20} className="text-primary-600" />
                خيارات التعديل
              </h3>

              <div className="space-y-4">
                {/* Option 0: None */}
                <div 
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${mode === 'none' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 shadow-sm' : 'border-gray-200 hover:border-primary-300'}`}
                  onClick={() => setMode('none')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${mode === 'none' ? 'border-primary-600 bg-white' : 'border-gray-400 bg-gray-50'}`}>
                        {mode === 'none' && <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
                        </div>
                        <span className="font-bold text-gray-800">بدون تعديل التواريخ</span>
                    </div>
                    <Ban size={18} className="text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mr-8">الإبقاء على التواريخ الأصلية كما هي. يمكنك استخدام هذا الخيار إذا كنت ترغب بتعديل اسم المؤلف فقط.</p>
                </div>

                {/* Option 1: Fixed Time */}
                <div 
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${mode === 'fixed' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 shadow-sm' : 'border-gray-200 hover:border-primary-300'}`}
                  onClick={() => setMode('fixed')}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${mode === 'fixed' ? 'border-primary-600 bg-white' : 'border-gray-400 bg-gray-50'}`}>
                        {mode === 'fixed' && <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
                        </div>
                        <span className="font-bold text-gray-800">توقيت موحد</span>
                    </div>
                    <Clock size={18} className="text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mb-4 mr-8">توحيد جميع التعليقات على توقيت واحد.</p>
                  
                  {mode === 'fixed' && (
                    <div className="mr-8 animate-fadeIn">
                      <input
                        type="datetime-local"
                        value={fixedDate}
                        onChange={(e) => setFixedDate(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ltr text-sm"
                        style={{ direction: 'ltr' }}
                      />
                    </div>
                  )}
                </div>

                {/* Option 2: Shift Time */}
                <div 
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${mode === 'shift' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 shadow-sm' : 'border-gray-200 hover:border-primary-300'}`}
                  onClick={() => setMode('shift')}
                >
                   <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${mode === 'shift' ? 'border-primary-600 bg-white' : 'border-gray-400 bg-gray-50'}`}>
                        {mode === 'shift' && <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
                        </div>
                        <span className="font-bold text-gray-800">إزاحة زمنية</span>
                    </div>
                    <ArrowRightLeft size={18} className="text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mb-4 mr-8">إضافة أو إنقاص ساعات من التوقيت الحالي.</p>

                  {mode === 'shift' && (
                    <div className="mr-8 animate-fadeIn">
                      <div className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-3">
                          <span className="text-gray-500 text-sm">ساعة</span>
                          <input
                            type="number"
                            value={shiftHours}
                            onChange={(e) => setShiftHours(Number(e.target.value))}
                            className="w-full py-2 text-gray-700 focus:outline-none bg-transparent ltr text-left font-mono font-bold"
                            placeholder="0"
                            dir="ltr"
                          />
                          <span className="text-gray-400 text-lg font-mono">+</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">استخدم قيم سالبة للإنقاص (مثال: -2)</p>
                    </div>
                  )}
                </div>

                {/* Option 3: Distribute Time */}
                <div 
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${mode === 'distribute' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 shadow-sm' : 'border-gray-200 hover:border-primary-300'}`}
                  onClick={() => setMode('distribute')}
                >
                   <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${mode === 'distribute' ? 'border-primary-600 bg-white' : 'border-gray-400 bg-gray-50'}`}>
                        {mode === 'distribute' && <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
                        </div>
                        <span className="font-bold text-gray-800">توزيع زمني</span>
                    </div>
                    <CalendarRange size={18} className="text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mb-4 mr-8">تقسيم الوقت بالتساوي بين بداية ونهاية على جميع التعليقات، مع إمكانية استثناء فترات معينة.</p>

                  {mode === 'distribute' && (
                    <div className="mr-8 space-y-4 animate-fadeIn">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1 font-medium">من (البداية):</label>
                          <input
                              type="datetime-local"
                              value={distributeStart}
                              onChange={(e) => setDistributeStart(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ltr text-sm"
                              style={{ direction: 'ltr' }}
                          />
                        </div>
                        <div className="flex justify-center -my-2 relative z-10">
                          <div className="bg-white p-1 rounded-full border border-gray-200 text-gray-400">
                              <ArrowRightLeft size={12} className="rotate-90" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1 font-medium">إلى (النهاية):</label>
                          <input
                              type="datetime-local"
                              value={distributeEnd}
                              onChange={(e) => setDistributeEnd(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ltr text-sm"
                              style={{ direction: 'ltr' }}
                          />
                        </div>
                      </div>

                      {/* Gaps Section */}
                      <div className="pt-4 border-t border-dashed border-gray-200 mt-2">
                         <label className="block text-xs text-gray-700 font-bold mb-2 flex items-center gap-1">
                           <Ban size={14} className="text-red-500" />
                           استثناء أوقات (فجوات):
                         </label>
                         
                         {/* List of existing gaps */}
                         {gaps.length > 0 && (
                           <div className="space-y-2 mb-3">
                             {gaps.map((gap) => (
                               <div key={gap.id} className="bg-red-50 border border-red-100 rounded px-2 py-1.5 flex items-center justify-between text-xs">
                                  <div className="flex flex-col">
                                    <span dir="ltr">{gap.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {gap.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    <span className="text-[10px] text-gray-500" dir="ltr">{gap.start.toLocaleDateString()}</span>
                                  </div>
                                  <button onClick={() => removeGap(gap.id)} className="text-red-500 hover:text-red-700 p-1">
                                    <Trash2 size={14} />
                                  </button>
                               </div>
                             ))}
                           </div>
                         )}

                         {/* Add new gap */}
                         <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="mb-2">
                                <label className="block text-[10px] text-gray-500 mb-1">بداية الفجوة</label>
                                <input
                                  type="datetime-local"
                                  value={newGapStart}
                                  onChange={(e) => setNewGapStart(e.target.value)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none ltr"
                                  style={{ direction: 'ltr' }}
                                />
                            </div>
                            <div className="mb-2">
                                <label className="block text-[10px] text-gray-500 mb-1">نهاية الفجوة</label>
                                <input
                                  type="datetime-local"
                                  value={newGapEnd}
                                  onChange={(e) => setNewGapEnd(e.target.value)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none ltr"
                                  style={{ direction: 'ltr' }}
                                />
                            </div>
                            <button 
                              onClick={addGap}
                              disabled={!newGapStart || !newGapEnd}
                              className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs py-1.5 rounded flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <Plus size={12} />
                              إضافة فترة مستثناة
                            </button>
                         </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Option 4: Custom Periods */}
                <div 
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${mode === 'custom_periods' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 shadow-sm' : 'border-gray-200 hover:border-primary-300'}`}
                  onClick={() => setMode('custom_periods')}
                >
                   <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${mode === 'custom_periods' ? 'border-primary-600 bg-white' : 'border-gray-400 bg-gray-50'}`}>
                        {mode === 'custom_periods' && <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
                        </div>
                        <span className="font-bold text-gray-800">فترات مخصصة</span>
                    </div>
                    <CheckCircle size={18} className="text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mb-4 mr-8">تقسيم الوقت حصرياً على فترات محددة (عكس التوزيع مع استثناء فجوات).</p>

                  {mode === 'custom_periods' && (
                    <div className="mr-8 space-y-4 animate-fadeIn">
                       <div className="pt-2">
                         {/* List of existing periods */}
                         {customPeriods.length > 0 && (
                           <div className="space-y-2 mb-3">
                             {customPeriods.map((period) => (
                               <div key={period.id} className="bg-green-50 border border-green-200 rounded px-2 py-1.5 flex items-center justify-between text-xs">
                                  <div className="flex flex-col">
                                    <span dir="ltr">{period.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {period.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    <span className="text-[10px] text-gray-500" dir="ltr">{period.start.toLocaleDateString()}</span>
                                  </div>
                                  <button onClick={() => removeCustomPeriod(period.id)} className="text-red-500 hover:text-red-700 p-1">
                                    <Trash2 size={14} />
                                  </button>
                               </div>
                             ))}
                           </div>
                         )}

                         {/* Add new period */}
                         <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="mb-2">
                                <label className="block text-[10px] text-gray-500 mb-1">بداية الفترة</label>
                                <input
                                  type="datetime-local"
                                  value={newPeriodStart}
                                  onChange={(e) => setNewPeriodStart(e.target.value)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none ltr"
                                  style={{ direction: 'ltr' }}
                                />
                            </div>
                            <div className="mb-2">
                                <label className="block text-[10px] text-gray-500 mb-1">نهاية الفترة</label>
                                <input
                                  type="datetime-local"
                                  value={newPeriodEnd}
                                  onChange={(e) => setNewPeriodEnd(e.target.value)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary-500 focus:outline-none ltr"
                                  style={{ direction: 'ltr' }}
                                />
                            </div>
                            <button 
                              onClick={addCustomPeriod}
                              disabled={!newPeriodStart || !newPeriodEnd}
                              className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs py-1.5 rounded flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <Plus size={12} />
                              إضافة فترة مسموحة
                            </button>
                         </div>
                       </div>
                    </div>
                  )}
                </div>

                {/* Option 5: Daily Recurring */}
                <div 
                  className={`border rounded-xl p-4 cursor-pointer transition-all ${mode === 'daily_recurring' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500 shadow-sm' : 'border-gray-200 hover:border-primary-300'}`}
                  onClick={() => setMode('daily_recurring')}
                >
                   <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${mode === 'daily_recurring' ? 'border-primary-600 bg-white' : 'border-gray-400 bg-gray-50'}`}>
                        {mode === 'daily_recurring' && <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
                        </div>
                        <span className="font-bold text-gray-800">توزيع متكافئ يومي</span>
                    </div>
                    <RefreshCw size={18} className="text-gray-400" />
                  </div>
                  <p className="text-xs text-gray-500 mb-4 mr-8">تحديد أيام، وساعات يتكرر توزيع التعليقات عليها يومياً ضمن تلك الأيام.</p>

                  {mode === 'daily_recurring' && (
                    <div className="mr-8 space-y-4 animate-fadeIn">
                       <div className="pt-2">
                         {dailyWindows.length > 0 && (
                           <div className="space-y-2 mb-3">
                             {dailyWindows.map((tw) => (
                               <div key={tw.id} className="bg-blue-50 border border-blue-200 rounded px-2 py-1.5 flex flex-col justify-between text-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1">
                                      <span>من</span>
                                      <span dir="ltr" className="font-mono bg-white px-1 border rounded">{tw.startDate}</span> 
                                      <span>إلى</span>
                                      <span dir="ltr" className="font-mono bg-white px-1 border rounded">{tw.endDate}</span>
                                    </div>
                                    <button onClick={() => removeDailyWindow(tw.id)} className="text-red-500 hover:text-red-700 p-1">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-gray-500">الوقت:</span>
                                    <span dir="ltr" className="font-mono bg-white px-1 border rounded text-[10px]">{tw.startTime}</span> 
                                    <span>-</span>
                                    <span dir="ltr" className="font-mono bg-white px-1 border rounded text-[10px]">{tw.endTime}</span>
                                  </div>
                               </div>
                             ))}
                           </div>
                         )}

                         <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 flex flex-col gap-2 text-xs">
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 mb-1">من يوم</label>
                                <input
                                  type="date"
                                  value={newWindowStartDate}
                                  onChange={(e) => setNewWindowStartDate(e.target.value)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 focus:outline-none ltr"
                                  style={{ direction: 'ltr' }}
                                />
                              </div>
                              <div className="flex-1">
                                <label className="block text-[10px] text-gray-500 mb-1">إلى يوم</label>
                                <input
                                  type="date"
                                  value={newWindowEndDate}
                                  onChange={(e) => setNewWindowEndDate(e.target.value)}
                                  className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 focus:outline-none ltr"
                                  style={{ direction: 'ltr' }}
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                  <label className="block text-[10px] text-gray-500 mb-1">من الساعة</label>
                                  <input
                                    type="time"
                                    value={newWindowStart}
                                    onChange={(e) => setNewWindowStart(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 focus:outline-none ltr"
                                    style={{ direction: 'ltr' }}
                                  />
                              </div>
                              <div className="flex-1">
                                  <label className="block text-[10px] text-gray-500 mb-1">إلى الساعة</label>
                                  <input
                                    type="time"
                                    value={newWindowEnd}
                                    onChange={(e) => setNewWindowEnd(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1 focus:ring-1 focus:ring-primary-500 focus:outline-none ltr"
                                    style={{ direction: 'ltr' }}
                                  />
                              </div>
                            </div>
                            <button 
                              onClick={addDailyWindow}
                              disabled={!newWindowStart || !newWindowEnd || !newWindowStartDate || !newWindowEndDate}
                              className="mt-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-1.5 px-2 rounded flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <Plus size={12} /> إضافة نافذة تكرار
                            </button>
                         </div>
                       </div>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>© {new Date().getFullYear()} معدل توقيت PDF. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
