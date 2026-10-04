'use strict';

// U-Tech keys are read-only. Edits use Next-specific keys exclusively.
window.NextContext = (() => {
  const keys = {selection:'utech_next_selection_v1',history:'utech_next_user_history_v1'};
  const valid = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
  const read = key => {try {return localStorage.getItem(key);} catch {return null;}};
  const json = (key, fallback) => {try {return JSON.parse(read(key)) ?? fallback;} catch {return fallback;}};
  const write = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value)); return true;} catch {return false;}};
  const user = () => document.getElementById('next-user-id');
  const point = () => document.getElementById('next-point-id');
  let selected = {user_id:'',point_id:''};
  function history() {
    return [...new Set([json(keys.history,[]),json('usui_user_id_history',[])].flatMap(list=>Array.isArray(list)?list.filter(valid):[]))].slice(0,10);
  }
  function renderHistory() {
    const select = document.getElementById('next-user-history');
    select.replaceChildren(new Option('履歴',''));
    for (const value of history()) select.append(new Option(value,value));
  }
  function render() {
    document.getElementById('selected-context').textContent = selected.user_id
      ? `実測ID：user_id ${selected.user_id} ／ point_id ${selected.point_id || '未指定'}` : '実測ID：未選択';
    document.getElementById('mapping-status').textContent = '予報地点との対応：未設定';
  }
  function error(message) {
    const node = document.getElementById('context-error'); node.textContent = message; node.hidden = !message;
  }
  function prepare() {
    const candidate = {user_id:user().value.trim(),point_id:point().value.trim()};
    if ((candidate.user_id && !valid(candidate.user_id)) || (candidate.point_id && !valid(candidate.point_id))) {
      error('IDは半角英数字で始まる64文字以内の英数字・ハイフン・アンダースコアで入力してください。'); return false;
    }
    if (candidate.point_id && !candidate.user_id) {error('point_idを指定する場合はuser_idも入力してください。'); return false;}
    selected = candidate; user().value = selected.user_id; point().value = selected.point_id;
    const stored = write(keys.selection,selected);
    if (selected.user_id) write(keys.history,[selected.user_id,...history().filter(value=>value!==selected.user_id)].slice(0,10));
    error(stored ? '' : 'ブラウザへIDを保存できません。この画面内では選択を使えます。');
    renderHistory(); render(); return true;
  }
  function initialize() {
    const params = new URLSearchParams(window.location.search);
    const saved = json(keys.selection,{}), mainUser = read('usui_user_id');
    // URL > last applied U-Tech user > last Next user; never reuse an unrelated point.
    const hasUrl = params.has('user_id') || params.has('point_id');
    const candidateUser = hasUrl ? (params.get('user_id') || '') : (valid(mainUser) ? mainUser : saved?.user_id);
    const candidatePoint = hasUrl ? (params.get('point_id') || '') : (saved?.user_id === candidateUser ? saved?.point_id : '');
    selected = {user_id:valid(candidateUser)?candidateUser:'',point_id:valid(candidateUser)&&valid(candidatePoint)?candidatePoint:''};
    user().value = selected.user_id; point().value = selected.point_id;
    if (hasUrl && ((candidateUser && !valid(candidateUser)) || (candidatePoint && (!valid(candidatePoint) || !valid(candidateUser))))) {
      selected={user_id:'',point_id:''}; user().value=''; point().value='';
      error('URLのID指定が正しくありません。入力欄から指定してください。');
    }
    renderHistory(); render();
    document.getElementById('next-user-history').addEventListener('change',event=>{
      if (event.target.value) {if (user().value !== event.target.value) point().value=''; user().value=event.target.value;}
    });
    user().addEventListener('input',()=>{if (user().value.trim() !== selected.user_id) point().value='';});
  }
  return {initialize,prepare};
})();
