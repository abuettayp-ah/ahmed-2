
import { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict } from 'pdf-lib';
import { DateModificationConfig, TimeGap, PdfMetadata } from '../types';

// Helper to format a JS Date to PDF Date string format: D:YYYYMMDDHHmmSSOHH'mm'
const formatPdfDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  
  // Get timezone offset
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMinutes = pad(absOffset % 60);

  return `D:${year}${month}${day}${hours}${minutes}${seconds}${sign}${offsetHours}'${offsetMinutes}'`;
};

// Robust PDF Date parser
const parsePdfDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  try {
    // Remove "D:" prefix if present
    const cleanStr = dateStr.startsWith('D:') ? dateStr.substring(2) : dateStr;
    
    // Regex to capture YYYYMMDDHHmmSS (and optional parts)
    // We strictly look for the first 14 digits for the base time
    const match = cleanStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    
    if (match) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // JS months are 0-based
      const day = parseInt(match[3]);
      const hour = parseInt(match[4]);
      const minute = parseInt(match[5]);
      const second = parseInt(match[6]);
      
      return new Date(year, month, day, hour, minute, second);
    }
    
    // Fallback for shorter dates (e.g. no seconds)
    if (cleanStr.length >= 12) {
       const year = parseInt(cleanStr.substring(0, 4));
       const month = parseInt(cleanStr.substring(4, 6)) - 1;
       const day = parseInt(cleanStr.substring(6, 8));
       const hour = parseInt(cleanStr.substring(8, 10));
       const minute = parseInt(cleanStr.substring(10, 12));
       return new Date(year, month, day, hour, minute, 0);
    }

    return null;
  } catch (e) {
    console.warn("Date parse error:", e);
    return null;
  }
};

/**
 * Merge overlapping gaps and sort them by time.
 * Filter out gaps that are outside the global range.
 */
const processGaps = (gaps: TimeGap[], globalStart: Date, globalEnd: Date): {start: number, end: number}[] => {
    if (!gaps || gaps.length === 0) return [];
    
    const startMs = globalStart.getTime();
    const endMs = globalEnd.getTime();

    // 1. Convert to timestamps and clamp to global range
    let sortedGaps = gaps
        .map(g => ({ start: g.start.getTime(), end: g.end.getTime() }))
        .filter(g => g.start < endMs && g.end > startMs) // Overlaps global range
        .map(g => ({
            start: Math.max(g.start, startMs),
            end: Math.min(g.end, endMs)
        }))
        .sort((a, b) => a.start - b.start);

    if (sortedGaps.length === 0) return [];

    // 2. Merge overlapping intervals
    const merged: {start: number, end: number}[] = [];
    let current = sortedGaps[0];

    for (let i = 1; i < sortedGaps.length; i++) {
        const next = sortedGaps[i];
        if (next.start <= current.end) {
            // Overlapping or adjacent, merge
            current.end = Math.max(current.end, next.end);
        } else {
            merged.push(current);
            current = next;
        }
    }
    merged.push(current);

    return merged;
};

/**
 * Calculate the timestamp for a specific item index, skipping over gaps.
 */
const calculateDateWithGaps = (
    index: number,
    totalItems: number,
    start: Date,
    end: Date,
    gaps: TimeGap[]
): Date => {
    const startMs = start.getTime();
    const endMs = end.getTime();
    
    // Process gaps (merge and sort)
    const mergedGaps = processGaps(gaps, start, end);
    
    // Calculate total duration occupied by gaps within the range
    let totalGapDuration = 0;
    mergedGaps.forEach(g => {
        totalGapDuration += (g.end - g.start);
    });

    const totalDuration = endMs - startMs;
    const netDuration = totalDuration - totalGapDuration;

    // Safety check: if gaps cover everything, return start date
    if (netDuration <= 0) return start;

    // Calculate step size based on AVAILABLE time
    // If only 1 item, it goes to start. If > 1, distributed across.
    const step = totalItems > 1 ? netDuration / (totalItems - 1) : 0;
    
    // Target "virtual" time from start (as if there were no gaps)
    let targetVirtualTime = index * step;
    
    // Now map virtual time to real time by jumping over gaps
    let currentRealTime = startMs;
    let remainingVirtualTime = targetVirtualTime;

    // We assume gaps are sorted by start time
    for (const gap of mergedGaps) {
        // Distance to next gap from current pointer
        const distToGap = gap.start - currentRealTime;
        
        if (remainingVirtualTime <= distToGap) {
            // Target is before this gap
            return new Date(currentRealTime + remainingVirtualTime);
        } else {
            // Target is past this gap start
            // Consume the time up to the gap
            remainingVirtualTime -= distToGap;
            // Jump the gap
            currentRealTime = gap.end;
        }
    }

    // If we passed all gaps, add remainder
    return new Date(currentRealTime + remainingVirtualTime);
};


/**
 * Helper to generate allowed periods for daily recurring schedules
 */
const generateDailyRecurringPeriods = (
    dailyWindows: { startDate: string; endDate: string; startTime: string; endTime: string }[]
): { start: number; end: number }[] => {
    const periods: { start: number; end: number }[] = [];
    
    for (const window of dailyWindows) {
        // Normalize start/end dates to midnight for iteration
        const startDay = new Date(window.startDate);
        startDay.setHours(0, 0, 0, 0);
        
        const endDay = new Date(window.endDate);
        endDay.setHours(0, 0, 0, 0);

        // Loop through each day
        const currentDay = new Date(startDay);
        while (currentDay <= endDay) {
            const [startH, startM] = window.startTime.split(':').map(Number);
            const [endH, endM] = window.endTime.split(':').map(Number);
            
            const pStart = new Date(currentDay);
            pStart.setHours(startH, startM, 0, 0);
            
            const pEnd = new Date(currentDay);
            pEnd.setHours(endH, endM, 0, 0);
            
            if (pEnd > pStart) {
                periods.push({ start: pStart.getTime(), end: pEnd.getTime() });
            }
            currentDay.setDate(currentDay.getDate() + 1);
        }
    }
    
    return periods; // They will be sorted naturally if dailyWindows are sorted, but we will sort them in caller
};

/**
 * Calculate date directly from explicit allowed periods
 */
const calculateDateInAllowedPeriods = (
    index: number,
    totalItems: number,
    allowedPeriods: { start: number; end: number }[] // Must be sorted and non-overlapping
): Date | null => {
    if (allowedPeriods.length === 0) return null;

    let totalAllowedDuration = 0;
    allowedPeriods.forEach(p => {
        totalAllowedDuration += (p.end - p.start);
    });

    if (totalAllowedDuration <= 0) return new Date(allowedPeriods[0].start);

    const step = totalItems > 1 ? totalAllowedDuration / (totalItems - 1) : 0;
    let remainingVirtualTime = index * step;

    for (const period of allowedPeriods) {
        const periodDuration = period.end - period.start;
        // Include small epsilon to account for floating point errors
        if (remainingVirtualTime <= periodDuration + 0.001) {
            return new Date(period.start + remainingVirtualTime);
        } else {
            remainingVirtualTime -= periodDuration;
        }
    }

    return new Date(allowedPeriods[allowedPeriods.length - 1].end);
};

// Helper to exclude non-comment annotations like Links and Form Fields
const isCommentAnnotation = (annot: PDFDict): boolean => {
  const subtype = annot.get(PDFName.of('Subtype'));
  if (
    subtype === PDFName.of('Link') ||
    subtype === PDFName.of('Widget') ||
    subtype === PDFName.of('Screen') ||
    subtype === PDFName.of('PrinterMark') ||
    subtype === PDFName.of('TrapNet') ||
    subtype === PDFName.of('Watermark') ||
    subtype === PDFName.of('3D') ||
    subtype === PDFName.of('RichMedia')
  ) {
    return false;
  }
  return true;
};

export const extractPdfMetadata = async (pdfBuffer: ArrayBuffer): Promise<PdfMetadata> => {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  
  const authorsSet = new Set<string>();
  const datesSet = new Set<string>();
  const annotations: { author: string; date: string }[] = [];

  for (const page of pages) {
    const annots = page.node.Annots();
    if (annots) {
      const annotsArray = annots.asArray();
      for (const annotRef of annotsArray) {
        const annot = pdfDoc.context.lookup(annotRef);
        if (annot instanceof PDFDict) {
          if (!isCommentAnnotation(annot)) continue;

          let currentAuthor = '';

          // Extract Author (T)
          if (annot.has(PDFName.of('T'))) {
            const tEntry = annot.get(PDFName.of('T'));
            if (tEntry instanceof PDFString || tEntry instanceof PDFHexString) {
              currentAuthor = tEntry.decodeText();
              authorsSet.add(currentAuthor);
            }
          }
          
          // Extract Date
          let originalDateStr = null;
          let currentDateStr = '';
          if (annot.has(PDFName.of('M'))) {
            const mEntry = annot.get(PDFName.of('M'));
            if (mEntry instanceof PDFString || mEntry instanceof PDFHexString) {
              originalDateStr = mEntry.decodeText();
            }
          } else if (annot.has(PDFName.of('CreationDate'))) {
            const cEntry = annot.get(PDFName.of('CreationDate'));
            if (cEntry instanceof PDFString || cEntry instanceof PDFHexString) {
              originalDateStr = cEntry.decodeText();
            }
          }
          
          if (originalDateStr) {
             const parsedDate = parsePdfDate(originalDateStr);
             if (parsedDate) {
                 const pad = (n: number) => n.toString().padStart(2, '0');
                 currentDateStr = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}`;
                 datesSet.add(currentDateStr);
             }
          }

          if (currentAuthor || currentDateStr) {
             annotations.push({ author: currentAuthor, date: currentDateStr });
          }
        }
      }
    }
  }

  return {
    authors: Array.from(authorsSet).sort(),
    dates: Array.from(datesSet).sort(),
    annotations
  };
};

export const modifyPdfAnnotations = async (
  pdfBuffer: ArrayBuffer, 
  config: DateModificationConfig
): Promise<{ pdfBytes: Uint8Array; count: number }> => {
  
  const pdfDoc = await PDFDocument.load(pdfBuffer, { 
    ignoreEncryption: true 
  });

  const pages = pdfDoc.getPages();
  let modificationCount = 0;

  // Collection phase: Find all annotations first
  const allAnnotations: { annot: PDFDict, originalDateStr: string | null }[] = [];

  for (const page of pages) {
    const annots = page.node.Annots();
    if (annots) {
      const annotsArray = annots.asArray();
      for (const annotRef of annotsArray) {
        const annot = pdfDoc.context.lookup(annotRef);
        if (annot instanceof PDFDict) {
          
          if (!isCommentAnnotation(annot)) continue;

          // Apply Filters if provided
          let isFilteredOut = false;
          let currentAuthor = '';
          let currentOriginalDateStr: string | null = null;
          
          if (config.filters) {
            // Filter by Author
            if (annot.has(PDFName.of('T'))) {
              const tEntry = annot.get(PDFName.of('T'));
              if (tEntry instanceof PDFString || tEntry instanceof PDFHexString) {
                currentAuthor = tEntry.decodeText();
              }
            }
            if (config.filters.authors && config.filters.authors.length > 0) {
              if (!config.filters.authors.includes(currentAuthor)) {
                isFilteredOut = true;
              }
            }

            if (!isFilteredOut) {
              const modDateEntry = annot.get(PDFName.of('M'));
              if (modDateEntry instanceof PDFString || modDateEntry instanceof PDFHexString) {
                 currentOriginalDateStr = modDateEntry.decodeText();
              } else {
                 const creationDateEntry = annot.get(PDFName.of('CreationDate'));
                 if (creationDateEntry instanceof PDFString || creationDateEntry instanceof PDFHexString) {
                    currentOriginalDateStr = creationDateEntry.decodeText();
                 }
              }

              // Filter by Date
              if (config.filters.dates && config.filters.dates.length > 0 && currentOriginalDateStr) {
                 const parsedDate = parsePdfDate(currentOriginalDateStr);
                 let matchedDate = false;
                 if (parsedDate) {
                   const pad = (n: number) => n.toString().padStart(2, '0');
                   const dStr = `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}`;
                   if (config.filters.dates.includes(dStr)) {
                     matchedDate = true;
                   }
                 }
                 if (!matchedDate) {
                   isFilteredOut = true;
                 }
              }
            }
          } else {
             // Just extract date if no filters or dates filter
             const modDateEntry = annot.get(PDFName.of('M'));
             if (modDateEntry instanceof PDFString || modDateEntry instanceof PDFHexString) {
                currentOriginalDateStr = modDateEntry.decodeText();
             } else {
                const creationDateEntry = annot.get(PDFName.of('CreationDate'));
                if (creationDateEntry instanceof PDFString || creationDateEntry instanceof PDFHexString) {
                   currentOriginalDateStr = creationDateEntry.decodeText();
                }
             }
          }

          if (!isFilteredOut && (annot.has(PDFName.of('M')) || annot.has(PDFName.of('CreationDate')) || config.newAuthorName)) {
             allAnnotations.push({ annot, originalDateStr: currentOriginalDateStr });
          }
        }
      }
    }
  }

  const totalAnnots = allAnnotations.length;
  if (totalAnnots === 0) {
    return { pdfBytes: await pdfDoc.save(), count: 0 };
  }

  // Application phase
  for (let i = 0; i < totalAnnots; i++) {
    const { annot, originalDateStr } = allAnnotations[i];
    let newDateString: string | null = null;
    let newDate: Date | null = null;

    if (config.mode === 'fixed' && config.fixedDate) {
      newDate = config.fixedDate;
    } 
    else if (config.mode === 'shift' && config.shiftHours !== undefined && originalDateStr) {
      const current = parsePdfDate(originalDateStr);
      if (current) {
        current.setHours(current.getHours() + config.shiftHours);
        newDate = current;
      }
    }
    else if (config.mode === 'distribute' && config.startDate && config.endDate) {
       // Modified distribution logic to handle gaps
       newDate = calculateDateWithGaps(
           i, 
           totalAnnots, 
           config.startDate, 
           config.endDate, 
           config.gaps || []
       );
    }
    else if (config.mode === 'custom_periods' && config.customPeriods && config.customPeriods.length > 0) {
       let sortedPeriods = config.customPeriods
           .map(p => ({ start: p.start.getTime(), end: p.end.getTime() }))
           .sort((a, b) => a.start - b.start);
       
       // Merge overlapping periods
       const merged: {start: number, end: number}[] = [];
       if (sortedPeriods.length > 0) {
           let current = sortedPeriods[0];
           for (let j = 1; j < sortedPeriods.length; j++) {
               const next = sortedPeriods[j];
               if (next.start <= current.end) {
                   current.end = Math.max(current.end, next.end);
               } else {
                   merged.push(current);
                   current = next;
               }
           }
           merged.push(current);
       }
       
       newDate = calculateDateInAllowedPeriods(i, totalAnnots, merged) || newDate;
    }
    else if (config.mode === 'daily_recurring' && config.dailyWindows && config.dailyWindows.length > 0) {
       let generatedPeriods = generateDailyRecurringPeriods(config.dailyWindows);
       generatedPeriods.sort((a, b) => a.start - b.start);
       
       // Merge overlapping
       const merged: {start: number, end: number}[] = [];
       if (generatedPeriods.length > 0) {
           let current = generatedPeriods[0];
           for (let j = 1; j < generatedPeriods.length; j++) {
               const next = generatedPeriods[j];
               if (next.start <= current.end) {
                   current.end = Math.max(current.end, next.end);
               } else {
                   merged.push(current);
                   current = next;
               }
           }
           merged.push(current);
       }
       
       newDate = calculateDateInAllowedPeriods(i, totalAnnots, merged) || newDate;
    }

    if (newDate) {
      newDateString = formatPdfDate(newDate);
      const pdfDateStr = PDFString.of(newDateString);
      
      // Update Modified Date
      if (annot.has(PDFName.of('M'))) {
        annot.set(PDFName.of('M'), pdfDateStr);
      }
      
      // Update Creation Date if it exists
      if (annot.has(PDFName.of('CreationDate'))) {
        annot.set(PDFName.of('CreationDate'), pdfDateStr);
      }
    }

    if (config.newAuthorName) {
      const encodedName = PDFHexString.fromText(config.newAuthorName);
      annot.set(PDFName.of('T'), encodedName);
      // Ensure we increment modification count if only author changed
      if (!newDate) modificationCount++;
    }

    if (newDate) {
      modificationCount++;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, count: modificationCount };
};
