// Only user-approved people and merges. No guesswork from unrelated chats.
export function normalizePerson(value) {
 const name=String(value??'').trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>70||/[\x00-\x1f<>]/.test(name))throw new Error('Имя должно содержать от 2 до 70 символов.');
 return {name};
}
export function personKey(person) { return String(person?.name??'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е'); }
export function dedupeParticipants(primary, extras=[]) {
 const seen=new Set([personKey(primary)].filter(Boolean));
 const output=[];
 for(const person of extras){
  const key=personKey(person);
  if(!key||seen.has(key))continue;
  seen.add(key);output.push(person);
 }
 return output.slice(0,25);
}
function sourceKey(source) {
 return JSON.stringify([source?.chatId??null,source?.messageId??null,source?.text??'']);
}
export function mergePlanRecords(primary,secondary){
 if(!primary||!secondary||primary.id===secondary.id)throw new Error('Выбери две разные карточки.');
 if(primary.ownerId!==secondary.ownerId)throw new Error('Нельзя объединять чужие карточки.');
 // Otherwise /demo clear could delete the primary and leave a real meeting archived.
 if(Boolean(primary.seedTag)!==Boolean(secondary.seedTag))throw new Error('Тестовую карточку нельзя объединять с настоящей договорённостью.');
 if(primary.mergedInto||secondary.mergedInto)throw new Error('Карточка уже объединена с другой.');
 if(['dismissed','done'].includes(primary.status)||['dismissed','done'].includes(secondary.status))throw new Error('Завершённые карточки нельзя объединить.');
 const isPlan=loop=>loop.kind==='plan'||loop.type==='event';
 if(!isPlan(primary)||!isPlan(secondary))throw new Error('Объединять можно только встречи и договорённости.');
 const additional=[...(primary.participants??[]),secondary.person,...(secondary.participants??[])].filter(Boolean);
 const mergedSources=[...(primary.relatedSources??[]),secondary.source,...(secondary.relatedSources??[])].filter(Boolean);
 const sourceSet=new Set([sourceKey(primary.source)]);
 const relatedSources=[];
 for(const source of mergedSources){
  const key=sourceKey(source);
  if(sourceSet.has(key))continue;
  sourceSet.add(key);
  relatedSources.push(source);
 }
 const mergeHistory = [
  ...(primary.mergeHistory??[]),
  {
   secondaryId:secondary.id,
   before:{
    participants:primary.participants??[],
    relatedSources:primary.relatedSources??[],
    mergedFrom:primary.mergedFrom??[]
   },
   secondaryBefore:{
    status:secondary.status,
    mergedInto:secondary.mergedInto??null
   },
   mergedAt:new Date().toISOString()
  }
 ].slice(-30);
 return {
  ...primary,
  participants:dedupeParticipants(primary.person,additional),
  relatedSources:relatedSources.slice(0,30),
  mergedFrom:[...new Set([...(primary.mergedFrom??[]),secondary.id,...(secondary.mergedFrom??[])])].slice(0,30),
  mergeHistory,
  updatedAt:new Date().toISOString()
 };
}

/** Undo only the most recent merge. Older merges remain linked. */
export function unmergePlanRecords(primary, secondary) {
 const last=primary?.mergeHistory?.at(-1);
 if (!last || !secondary || last.secondaryId!==secondary.id) throw new Error('Объединение не найдено.');
 if (primary.ownerId!==secondary.ownerId) throw new Error('Нельзя разделять чужие договорённости.');
 if (primary.mergedInto || secondary.mergedInto!==primary.id) throw new Error('Договорённость уже разделена или объединена в другую.');
 const updatedAt=new Date().toISOString();
 return {
  primary:{
   ...primary,
   participants:last.before.participants??[],
   relatedSources:last.before.relatedSources??[],
   mergedFrom:last.before.mergedFrom??[],
   mergeHistory:primary.mergeHistory.slice(0,-1),
   updatedAt
  },
  secondary:{
   ...secondary,
   status:last.secondaryBefore.status??'open',
   mergedInto:last.secondaryBefore.mergedInto??null,
   updatedAt
  }
 };
}
