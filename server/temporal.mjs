// Time semantics for LOOP: a promised deadline is not a meeting date,
// and snoozing a card must never overwrite either of them.
export function validDate(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const date = new Date(value + 'T00:00:00Z');
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function validInstant(value) {
 return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
export function supportsDeadline(loop) {
 return loop?.kind !== 'plan' && loop?.type !== 'event' && loop?.type !== 'saved'
   && loop?.nextAction !== 'none' && loop?.agreementStatus !== 'proposed';
}
export function isConfirmedEvent(loop) {
 return loop?.kind === 'plan' && loop?.agreementStatus === 'confirmed' && loop?.type === 'event';
}
function localDay(value, zone) {
 const parts = new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'})
  .formatToParts(new Date(value));
 const get = key => parts.find(part=>part.type===key)?.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
export function temporalStatus(loop, now = Date.now(), zone = 'UTC') {
 if (!loop || ['done','dismissed'].includes(loop.status)) return null;
 const time = typeof now === 'number' ? now : new Date(now).getTime();
 if (!Number.isFinite(time)) return null;
 if (supportsDeadline(loop)) {
  if (validInstant(loop.deadlineAt)) return Date.parse(loop.deadlineAt) < time ? 'overdue' : null;
  if (validDate(loop.deadlineDate)) return localDay(time,zone) > loop.deadlineDate ? 'overdue' : null;
  // Legacy cards have only dueAt. Snoozed cards have that same field, which
  // is not reliable evidence of a deadline.
  if (loop.status !== 'snoozed' && validInstant(loop.dueAt)) return Date.parse(loop.dueAt) < time ? 'overdue' : null;
 }
 if (isConfirmedEvent(loop)) {
  if (validInstant(loop.eventAt)) return Date.parse(loop.eventAt) < time ? 'past_event' : null;
  if (validDate(loop.eventDate)) return localDay(time,zone) > loop.eventDate ? 'past_event' : null;
  if (validInstant(loop.dueAt)) return Date.parse(loop.dueAt) < time ? 'past_event' : null;
 }
 return null;
}
export function snoozeDue(loop, now=Date.now()) {
 if (loop.status !== 'snoozed') return false;
 const date=loop.snoozedUntil || loop.dueAt; // old installations
 return validInstant(date) && Date.parse(date) <= now;
}
export function reminderAt(loop) {
 if (!loop || ['done','dismissed'].includes(loop.status) || loop.type === 'saved') return null;
 if (loop.status === 'snoozed') return validInstant(loop.snoozedUntil || loop.dueAt) ? (loop.snoozedUntil || loop.dueAt) : null;
 if (loop.agreementStatus === 'proposed' || loop.agreementStatus === 'unknown') return null;
 if (validInstant(loop.deadlineAt) && supportsDeadline(loop)) return loop.deadlineAt;
 if (validInstant(loop.eventAt) && isConfirmedEvent(loop)) return loop.eventAt;
 // Old cards keep their established reminder behavior.
 return validInstant(loop.dueAt) ? loop.dueAt : null;
}
export function acceptedSchedule(item, normalized, text) {
 const output={};
 // A model can propose normalized ISO dates, but no date at all must be
 // accepted unless the original message contains a date/time expression.
 const evidence=/(?:сегодня|завтра|послезавтра|понедельник|вторник|среду|четверг|пятниц|суббот|воскресень|\d{1,2}[./-]\d{1,2}|\d{1,2}\s+(?:числа|октябр|ноябр|декабр|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр))/iu.test(text??'');
 if (!evidence) return output;
 if (supportsDeadline(normalized)) {
  if (validDate(item.deadlineDate)) output.deadlineDate=item.deadlineDate;
  if (validInstant(item.deadlineAt)) output.deadlineAt=item.deadlineAt;
 } else if (isConfirmedEvent(normalized)) {
  if (validDate(item.eventDate)) output.eventDate=item.eventDate;
  if (validInstant(item.eventAt)) output.eventAt=item.eventAt;
 }
 return output;
}
