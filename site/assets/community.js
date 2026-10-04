/* Nomerok 6.0: cars, gifts, public profiles and permission-scoped staff UI. */
'use strict';
const CUI = {epoch:0,loading:false,error:'',catalog:[],people:null,query:'',peoplePage:0,
  player:null,playerId:storage.get('nomerok.viewed-player',0,true),inventory:null,inventoryKind:'cars',inventoryPage:0,
  ledger:null,ledgerPage:0,inbox:null,inboxPage:0,recipient:null,recipientResults:null,transferKind:'money',
  roles:null,teamSearch:null,teamTarget:null,staffData:null,staffSection:'overview',staffPage:0,staffQuery:'',
  carQuery:'',carSort:'price',roleEditing:0};
const EXTRA_PAGES=['fleet','people','player','transfers','titles','team','staff','inbox','support'];
const STAFF_NAMES={credit:'Выдать игровые ₽',debit:'Списать игровые ₽',ban:'Заблокировать',unban:'Разблокировать',
  vip:'Изменить VIP',grant_plate:'Выдать номер',grant_car:'Выдать машину',reset_daily:'Сбросить таймер бонуса'};
const STAFF_RIGHTS={credit:'economy.credit',debit:'economy.debit',ban:'moderation.ban',unban:'moderation.ban',
  vip:'vip.manage',grant_plate:'plates.grant',grant_car:'cars.grant',reset_daily:'daily.reset'};
const pendingCommunityKey=`nomerok.community.pending.${DEMO?'demo':user.id||'anonymous'}`;
let pendingCommunity=storage.get(pendingCommunityKey,null,true);
if(pendingCommunity&&(!pendingCommunity.action||!pendingCommunity.data?.request_id))pendingCommunity=null;
const shortMoney=n=>Math.abs(Number(n))>=1e6?`${Number((n/1e6).toFixed(2)).toLocaleString('ru-RU')} млн ₽`:money(n);
const owner=()=>Boolean(S?.staff?.owner);
const staffCan=p=>owner()||Boolean(S?.staff?.permissions?.includes(p));
const carModel=id=>CAR_CATALOG.find(c=>c.id===id);
const ownedCar=id=>S?.cars?.find(c=>c.id===Number(id));
function roleBadge(p){return p?.staff_title?`<span class="staff-badge ${p.is_owner?'owner':''}">${icon('shield')}${escapeHTML(p.staff_title)}</span>`:'';}
function accountHead(p,self=false){return `<div class="account-head"><div class="avatar">${escapeHTML((p.name||'И').slice(0,1).toUpperCase())}</div><div class="grow"><div class="account-name"><h2>${escapeHTML(p.name||'Игрок')}</h2>${roleBadge(p)}</div><p class="hint">${p.handle?'@'+escapeHTML(p.handle)+' · ':''}ID ${p.user_id}</p><div class="title-badge">${icon('trophy')}${escapeHTML(p.title||'Новичок')}<span>Ур. ${p.level||1}</span></div></div>${!self?`<button class="icon-btn" data-action="gift-to-player" aria-label="Передать подарок">${icon('gift')}</button>`:''}</div>`;}
function capitalPanel(p){
  return `<div class="capital-hero"><div><div class="eyebrow">КАПИТАЛ КОЛЛЕКЦИИ</div><strong title="${money(p.total_worth)}">${shortMoney(p.total_worth)}</strong><p class="hint">Баланс + номера + машины</p></div>${icon('wallet')}</div>
  <div class="capital-grid">${[['На балансе',p.balance,'Доступно для покупок','wallet'],['В номерах',p.plate_worth,`${p.plate_count} ном. · на аукционе ${p.market_count}`,'garage'],['В машинах',p.car_worth,`${p.car_count} авто · без стоимости номеров`,'gem']].map(([label,value,sub,ico])=>`<div class="capital-card">${icon(ico)}<small>${label}</small><strong title="${money(value)}">${shortMoney(value)}</strong><span>${money(value)}</span><p>${sub}</p></div>`).join('')}</div>`;
}
function showcaseHTML(car,emptySelf=false){
  if(!car)return emptySelf?`<div class="showcase-empty">${icon('garage')}<div><h3>Твоё главное авто</h3><p>Выбери машину в гараже и поставь её на витрину.</p></div><button class="secondary" data-page="fleet">В гараж</button></div>`:'';
  const model=carModel(car.model_id)||car;
  return `<article class="showcase" style="${rarityStyle(model)}"><div class="showcase-photo">${carPhotoHTML(model,true)}</div><div class="showcase-info"><div class="eyebrow">ВИТРИНА КОЛЛЕКЦИОНЕРА</div><h3>${escapeHTML(car.brand)}<br>${escapeHTML(car.model)}</h3>${car.plate?`<div class="mounted-plate">${plateHTML(car.plate)}</div>`:'<span class="hint">Без установленного номера</span>'}<div class="quick-tags"><span class="quick-tag">${escapeHTML(car.rarity)}</span><span class="quick-tag">${money(car.value)}</span></div></div></article>`;
}
function pageTools(){return `<div class="quick-nav"><button class="secondary" data-page="fleet">${icon('garage')}Мои машины</button><button class="secondary" data-page="garage">Номера</button><button class="secondary" data-page="market">Аукцион</button></div>`;}
function communityPager(result,scope){if(!result||result.total<=result.page_size)return '';const count=Math.ceil(result.total/result.page_size);return `<div class="pagination"><button class="icon-btn" data-action="community-page" data-scope="${scope}" data-n="${result.page-1}" ${result.page===0?'disabled':''} aria-label="Назад">${icon('back')}</button><span>${result.page+1} / ${count} · ${result.total}</span><button class="icon-btn" data-action="community-page" data-scope="${scope}" data-n="${result.page+1}" ${result.page+1>=count?'disabled':''} aria-label="Далее">${icon('arrow')}</button></div>`;}
function communityStatus(){return CUI.loading?'<div class="inline-loading"><span class="loader"></span>Загружаем…</div>':CUI.error?`<div class="admin-notice error">${escapeHTML(CUI.error)}<button class="secondary" data-action="community-refresh">Повторить</button></div>`:'';}
async function loadCommunity(target=page){
  const epoch=++CUI.epoch,generation=stateGeneration;
  CUI.loading=true;CUI.error='';render();
  try{
    let action='state',data={};
    if(target==='cars')action='catalog';
    if(target==='people'){action='people';data={query:CUI.query,page:CUI.peoplePage};}
    if(target==='player'){action='player';data={user_id:CUI.playerId};}
    if(target==='transfers'){action='ledger';data={page:CUI.ledgerPage};}
    if(target==='inbox'){action='inbox';data={page:CUI.inboxPage};}
    if(target==='team')action='roles';
    if(target==='staff'){action='staff';data={section:CUI.staffSection,page:CUI.staffPage,query:CUI.staffQuery};}
    const j=await request(action,data);
    if(epoch!==CUI.epoch||generation!==stateGeneration)return;
    commit(j);takeCommunity(j);
    if(target==='player'){
      const v=await request('inventory',{user_id:CUI.playerId,kind:CUI.inventoryKind,page:CUI.inventoryPage});
      if(epoch!==CUI.epoch||generation!==stateGeneration)return;commit(v);takeCommunity(v);
    }
  }catch(e){if(epoch===CUI.epoch){CUI.error=e.message;if(e.status===403){try{const j=await request('state');if(epoch===CUI.epoch&&generation===stateGeneration)commit(j);}catch{}}}}
  finally{if(epoch===CUI.epoch){CUI.loading=false;if(page===target)render();}}
}
function takeCommunity(j){
  if(j.catalog){CUI.catalog=j.catalog;for(const v of j.catalog){const c=carModel(v.id);if(c)Object.assign(c,v);}}
  if(j.people)CUI.people=j.people;if(j.player)CUI.player=j.player;if(j.inventory)CUI.inventory=j.inventory;
  if(j.ledger)CUI.ledger=j.ledger;if(j.inbox)CUI.inbox=j.inbox;if(j.roles)CUI.roles=j.roles;
  if(j.staff_panel)CUI.staffData=j.staff_panel;
}
async function communityWrite(action,op,data={},after=null,retry=false){
  if(busy||spinning)return;
  if(pendingCommunity&&!retry)return notify('Сначала проверь предыдущую операцию. Повторное нажатие не создаст новую покупку.',true);
  const packet=retry?pendingCommunity:{action,data:{...data,op,confirmed:true,request_id:requestID()}};
  if(!packet)return;
  pendingCommunity=packet;storage.set(pendingCommunityKey,packet,true);
  busy=true;stateGeneration++;setControlsBusy();closeDialog();
  try{
    const j=await request(packet.action,packet.data);
    commit(j);takeCommunity(j);pendingCommunity=null;storage.set(pendingCommunityKey,null,true);
    haptic('success');audio.click();notify(j.message||'Готово.');
    render();after?.(j);
  }catch(e){
    if(!e.uncertain){pendingCommunity=null;storage.set(pendingCommunityKey,null,true);}
    notify(e.uncertain?'Ответ потерялся. Нажми «Проверить операцию» — повторного списания не будет.':e.message,true);
  }finally{
    busy=false;render();setControlsBusy();
    if(!pendingCommunity&&['team','staff','transfers','inbox'].includes(page))loadCommunity(page);
  }
}
function openPlayer(id){
  CUI.playerId=Number(id);CUI.player=null;CUI.inventory=null;CUI.inventoryPage=0;CUI.inventoryKind='cars';
  storage.set('nomerok.viewed-player',CUI.playerId,true);
  const same=page==='player';navigate('player');if(same)loadCommunity('player');
}
function profileHTML(p,self=false){
  return `${accountHead(p,self)}${capitalPanel(p)}${showcaseHTML(p.showcase,self)}<div class="stats-grid"><div class="stat-card"><small>ПРОКРУТОВ</small><strong>${fmt(p.spins)}</strong></div><div class="stat-card"><small>VIP</small><strong>${p.vip?'×'+p.vip:'—'}</strong></div><div class="stat-card"><small>УРОВЕНЬ</small><strong>${p.level}</strong></div></div>`;
}
renderProfile=function(){
  const p=S.public_profile||demoProfile();
  return `${heading('Твой профиль','','КОЛЛЕКЦИОНЕР')}${profileHTML(p,true)}
  <div class="profile-links">${profileLink('fleet','Мои машины',`${p.car_count} авто в гараже`,'garage',true)}
  ${profileLink('people','Игроки','Найти коллекционера и посмотреть профиль','me',true)}
  ${profileLink('transfers','Передачи и история','Деньги, номера и машины','gift',true)}
  ${profileLink('titles','Титулы','Твой уровень и открытые звания','trophy',true)}
  ${profileLink('inbox','Уведомления',S.unread_notifications?`${S.unread_notifications} непрочитанных`:'Подарки и действия команды','quests',true)}
  ${S.is_admin?profileLink('admin','Панель владельца','Управление игрой и экономикой','shield',true):''}
  ${owner()?profileLink('team','Роли и команда','Создать роль, назначить права','settings',true):''}
  ${S.staff?.name?profileLink('staff','Панель команды',S.staff.name,'shield',true):''}
  ${profileLink('history','История выпадений','Все номера последних прокрутов','refresh',true)}
  ${profileLink('album','Альбом коллекции','Редкости и регионы','gem',true)}
  ${profileLink('auto-protect','Автозащита редких номеров',S.auto_protect?'Включена':'Выключена','shield')}
  ${profileLink('vip','VIP и пополнение','Мульти-крутки','gem',true)}
  ${profileLink('top','Топ коллекционеров','Рейтинг по общему капиталу','trophy',true)}
  ${profileLink('quests','Задания','Прогресс и награды','quests',true)}
  ${profileLink('daily','Ежедневный бонус','+'+money(S.daily_bonus),'gift')}
  ${profileLink('support','Поддержка и предложения','Написать владельцу','info',true)}
  ${profileLink('settings','Звук и эффекты','Анимации, громкость и вибрация','settings')}</div>
  <button class="secondary full" style="margin-top:20px" data-action="refresh-profile">${icon('refresh')}Обновить профиль</button>
  <p class="hint" style="margin-top:20px">Профиль и игровой капитал доступны другим игрокам. Номера на аукционе учтены по оценке, а не по цене объявления. Реальные платежи не отображаются.</p>`;
};
renderCars=function(){
  let items=CAR_CATALOG.filter(c=>(carFilter==='all'||c.brand===carFilter)&&(!CUI.carQuery||(c.brand+' '+c.model).toLowerCase().includes(CUI.carQuery.toLowerCase())));
  items.sort((a,b)=>CUI.carSort==='expensive'?b.price-a.price:a.price-b.price);
  return `${heading('Автосалон','Выбери машину для своей коллекции.','МАШИНЫ')}${pageTools()}${communityStatus()}
  <div class="toolbar"><label class="search-box">${icon('search')}<input class="input" id="car-search" value="${escapeHTML(CUI.carQuery)}" placeholder="Марка или модель" aria-label="Поиск машин"></label><select id="car-sort" aria-label="Сортировка"><option value="price" ${CUI.carSort==='price'?'selected':''}>Сначала доступнее</option><option value="expensive" ${CUI.carSort==='expensive'?'selected':''}>Сначала дороже</option></select></div>
  <div class="chips car-brands">${['all',...new Set(CAR_CATALOG.map(c=>c.brand))].map(b=>`<button class="chip ${carFilter===b?'active':''}" data-action="car-filter" data-brand="${escapeHTML(b)}">${b==='all'?'Все':escapeHTML(b)}</button>`).join('')}</div>
  <div class="cars-grid">${items.map(c=>`<article class="car-card" style="${rarityStyle(c)}">${carPhotoHTML(c)}<div class="car-body"><div class="car-title"><span>${escapeHTML(c.brand)}</span><h3>${escapeHTML(c.model)}</h3></div><div class="quick-tags"><span class="quick-tag">${escapeHTML(c.rarity)}</span><span class="quick-tag">${S.cars?.filter(v=>v.model_id===c.id).length||0} в гараже</span></div><div class="car-price">${money(c.price)}</div><button class="primary full" data-action="car-detail" data-id="${c.id}">Выбрать ${icon('arrow')}</button></div></article>`).join('')||empty('search','Ничего не найдено','Измени поиск.','')}</div>
  <div class="cars-footer"><span>Покупка только за игровые ₽.</span><button class="text-btn" data-action="all-photo-credits">Авторы фото</button></div>`;
};
carDetail=function(id){
  const c=carModel(id);if(!c)return;
  const canBuy=S.balance>=c.price;
  openDialog(`${c.brand} ${c.model}`,`${carPhotoHTML(c,true)}<div class="car-detail-price"><small>СТОИМОСТЬ В ИГРЕ</small><strong>${money(c.price)}</strong></div><p class="hint">На балансе: ${money(S.balance)}. Машина появится в твоём гараже. На неё можно установить принадлежащий тебе номер.</p><button class="text-btn car-credit" data-action="photo-credit" data-car-id="${c.id}">Автор и лицензия фото ${icon('arrow')}</button>
  <div class="modal-buttons"><button class="secondary" data-action="close-dialog">Назад</button><button class="primary" data-action="car-buy-confirm" data-car-id="${c.id}" ${canBuy?'':'disabled'}>${canBuy?'Купить':'Не хватает '+money(c.price-S.balance)}</button></div>`);
};
function buyCarConfirm(id){
  const c=carModel(id);if(!c)return;
  const data={model_id:id,expected_price:c.price,catalog_version:S.catalog_version};
  confirmDialog('Купить машину?',`<b>${escapeHTML(c.brand+' '+c.model)}</b><br>Стоимость: <b>${money(c.price)}</b> игровых ₽.<br>После покупки: ${money(S.balance-c.price)}.`,()=>communityWrite('community_action','buy_car',data,()=>navigate('fleet')),'Купить');
}
function renderFleet(){
  const cars=S.cars||[];
  return `${heading('Мои машины',`${cars.length} авто в коллекции`,'ГАРАЖ',true)}${pageTools()}<div class="quick-nav"><button class="primary" data-page="cars">${icon('market')}В автосалон</button><button class="secondary" data-page="transfers">${icon('gift')}Передать подарок</button></div>${communityStatus()}
  ${cars.length?`<div class="cars-grid">${cars.map(v=>{const c=carModel(v.model_id)||v;return `<article class="car-card owned-car" style="${rarityStyle(c)}"><div class="vehicle-badges"><span>#${v.id}</span>${v.showcased?'<span>На витрине</span>':''}${v.protected?'<span>Защищена</span>':''}</div>${carPhotoHTML(c)}<div class="car-body"><div class="car-title"><span>${escapeHTML(c.brand)}</span><h3>${escapeHTML(c.model)}</h3></div><div class="mounted-plate">${v.plate?plateHTML(v.plate):'<div class="plate-vacant">Номер не установлен</div>'}</div><div class="card-meta"><span>Стоимость машины</span><strong>${shortMoney(v.value)}</strong></div><button class="primary full" data-action="vehicle-detail" data-id="${v.id}">Управлять ${icon('arrow')}</button></div></article>`;}).join('')}</div>`:empty('garage','Первое авто ждёт тебя','Купи машину в автосалоне и установи свой номер.','В автосалон','cars')}`;
}
function vehicleDetail(id){
  const v=ownedCar(id);if(!v)return notify('Машина уже не в гараже.',true);
  const model=carModel(v.model_id)||v;
  openDialog(`${model.brand} ${model.model}`,`${carPhotoHTML(model,true)}<div class="mounted-plate">${v.plate?plateHTML(v.plate):'<div class="plate-vacant">Без номера</div>'}</div><div class="result-sheet-meta">Машина #${v.id} · ${money(v.value)}<br>${v.plate?`Номер: ${money(v.plate_value)} (учтён отдельно)`:'Установи один из своих номеров.'}</div>
  <div class="result-sheet-actions"><button class="primary" data-action="mount-picker" data-id="${v.id}">${icon('garage')}${v.plate?'Заменить номер':'Установить номер'}</button>${v.plate?`<button class="secondary" data-action="unmount-confirm" data-id="${v.id}">Снять номер</button>`:''}
  <button class="secondary" data-action="vehicle-protect" data-id="${v.id}">${icon('shield')}${v.protected?'Снять защиту':'Защитить от продажи и передачи'}</button>
  <button class="secondary" data-action="vehicle-showcase" data-id="${v.id}">${icon('star')}${v.showcased?'Уже на витрине':'Поставить на витрину профиля'}</button>
  <button class="secondary" data-action="vehicle-gift" data-id="${v.id}" ${v.protected?'disabled':''}>${icon('gift')}Передать игроку</button>
  <button class="secondary" data-action="vehicle-sell" data-id="${v.id}" ${v.protected?'disabled':''}>Продать дилеру · ${money(Math.floor(v.value*.75))}</button></div><p class="hint" style="margin-top:14px">Дилер выкупает за 75% стоимости. При продаже машины номер остаётся в твоём гараже.</p>`);
}
function mountPicker(id){
  const v=ownedCar(id);if(!v)return;
  const plates=S.garage.filter(g=>!g.mounted_car_id||g.mounted_car_id===v.id);
  if(!plates.length)return notify('Нет свободных номеров. Получи номер в рулетке или сними с другой машины.',true);
  openDialog('Установить номер',`<p>${escapeHTML(v.brand+' '+v.model)} · #${v.id}</p><label for="mount-plate-select">ТВОИ СВОБОДНЫЕ НОМЕРА</label><select class="input" id="mount-plate-select">${plates.map(g=>`<option value="${g.id}" ${g.id===v.plate_id?'selected':''}>${escapeHTML(g.plate)} · ${g.rarity}${g.fav?' · защищён':''}</option>`).join('')}</select><p class="hint">Защищённый номер можно установить. Если на машине уже стоит номер, он вернётся в список свободных.</p><div class="modal-buttons"><button class="secondary" data-action="vehicle-detail" data-id="${v.id}">Назад</button><button class="primary" data-action="mount-confirm" data-id="${v.id}">Продолжить</button></div>`);
}
function renderPeople(){
  return `${heading('Коллекционеры','Профили, коллекции и общий капитал.','СООБЩЕСТВО')}
  <form class="toolbar" id="people-search"><label class="search-box">${icon('search')}<input class="input" id="people-query" value="${escapeHTML(CUI.query)}" placeholder="ID, имя или @username" aria-label="Найти игрока" maxlength="80"></label><button class="primary" type="submit">Найти</button><button class="secondary" type="button" data-page="top">${icon('trophy')}Топ</button></form>${communityStatus()}
  <div class="people-list">${CUI.people?.items.map(p=>`<button class="person-row" data-action="open-player" data-id="${p.user_id}"><span class="avatar">${escapeHTML((p.name||'И').slice(0,1))}</span><span class="person-info"><strong>${nameHTML(p)}</strong><small>${p.handle?'@'+escapeHTML(p.handle)+' · ':''}ID ${p.user_id}</small><span class="person-title">${escapeHTML(p.title)} · Ур. ${p.level}</span></span><span class="person-worth"><strong>${shortMoney(p.total_worth)}</strong><small>${p.car_count} авто · ${p.plate_count} ном.</small></span>${icon('arrow')}</button>`).join('')||(!CUI.loading?empty('search','Игроки не найдены','Пользователь должен хотя бы раз открыть бота.',''):'')}</div>${communityPager(CUI.people,'people')}`;
}
function renderPlayer(){
  const p=CUI.player;
  if(!p)return `${heading('Профиль игрока','','СООБЩЕСТВО',true)}${communityStatus()}${!CUI.loading?'<button class="secondary" data-page="people">К поиску игроков</button>':''}`;
  return `${heading('Профиль игрока','','СООБЩЕСТВО',true)}${communityStatus()}${profileHTML(p)}
  <div class="quick-nav">${p.user_id!==S.user_id?'<button class="primary" data-action="gift-to-player">'+icon('gift')+'Передать подарок</button>':''}<button class="secondary" data-action="copy-player">Скопировать ID</button></div>
  <div class="chips"><button class="chip ${CUI.inventoryKind==='cars'?'active':''}" data-action="public-inventory" data-kind="cars">Машины · ${p.car_count}</button><button class="chip ${CUI.inventoryKind==='plates'?'active':''}" data-action="public-inventory" data-kind="plates">Номера · ${p.plate_count}</button></div>
  ${CUI.inventoryKind==='cars'?`<div class="cars-grid">${CUI.inventory?.items.map(v=>`<article class="car-card">${carPhotoHTML(carModel(v.model_id)||v)}<div class="car-body"><div class="car-title"><span>${escapeHTML(v.brand)}</span><h3>${escapeHTML(v.model)}</h3></div><div class="mounted-plate">${v.plate?plateHTML(v.plate):''}</div><div class="car-price">${money(v.value)}</div></div></article>`).join('')||'<p class="hint">Машин пока нет.</p>'}</div>`:`<div class="public-plates">${CUI.inventory?.items.map(g=>`<div class="collection-card" style="${rarityStyle(g)}">${plateHTML(g.plate)}<div class="card-meta"><span>${escapeHTML(g.rarity)}${g.location==='market'?' · на аукционе':''}</span><strong>${money(g.price)}</strong></div></div>`).join('')||'<p class="hint">Номеров пока нет.</p>'}</div>`}
  ${communityPager(CUI.inventory,'inventory')}<p class="hint" style="margin-top:20px">Установленные номера входят в стоимость номеров, а не машин. Лоты на аукционе не учитываются дважды.</p>`;
}
renderTop=function(){return `${heading('Топ коллекционеров','Баланс, номера и машины — в одном рейтинге.','ЗАЛ СЛАВЫ',true)}${TOP.map((p,i)=>`<button class="leader-row leader-button" data-action="open-player" data-id="${p.user_id}"><span class="rank">${String(i+1).padStart(2,'0')}</span><span class="grow">${nameHTML(p)}<small>${escapeHTML(p.title||'Коллекционер')} · Ур. ${p.level||1}</small></span><strong>${shortMoney(p.worth)}</strong>${icon('arrow')}</button>`).join('')||empty('trophy','Рейтинг ещё не загружен','Обнови список.','')}<button class="secondary full" data-action="refresh-top">Обновить</button>`;};
function recipientResults(result,scope){return result?.items.length?`<div class="recipient-results">${result.items.map(p=>`<button type="button" class="recipient-option" data-action="${scope==='team'?'team-recipient':'transfer-recipient'}" data-id="${p.user_id}"><strong>${nameHTML(p)}</strong><small>${p.handle?'@'+escapeHTML(p.handle)+' · ':''}ID ${p.user_id}</small>${icon('arrow')}</button>`).join('')}</div>`:result?'<p class="hint">Игрок не найден. Укажи точный ID или @username.</p>':'';}
function renderTransfers(){
  const type=CUI.transferKind,r=CUI.recipient;
  const plates=S.garage.filter(g=>!g.fav&&!g.mounted_car_id),cars=(S.cars||[]).filter(v=>!v.protected);
  const selected=CUI.transferAsset;
  return `${heading('Передачи','Подари деньги, номер или машину другому игроку.','СООБЩЕСТВО',true)}
  <section class="transfer-panel"><div class="section-title"><span class="step-badge">01</span><h3>Получатель</h3></div>
  ${r?`<div class="chosen-recipient"><div><strong>${escapeHTML(r.name)}</strong><p>${r.handle?'@'+escapeHTML(r.handle)+' · ':''}ID ${r.user_id}</p></div><button class="text-btn" data-action="recipient-clear">Изменить</button></div>`:`<form class="toolbar" id="transfer-search"><input class="input" id="recipient-query" aria-label="Получатель" placeholder="ID, имя или @username" maxlength="80" required><button class="secondary" type="submit">Найти</button></form>${recipientResults(CUI.recipientResults,'transfer')}`}
  <div class="section-title"><span class="step-badge">02</span><h3>Что передать</h3></div>
  <div class="chips">${[['money','Деньги'],['plate','Номер'],['car','Машина']].map(([k,n])=>`<button class="chip ${type===k?'active':''}" data-action="transfer-kind" data-kind="${k}">${n}</button>`).join('')}</div>
  <form id="transfer-form">${type==='money'?`<label for="gift-amount">СУММА В ИГРОВЫХ ₽</label><input class="input" type="number" id="gift-amount" min="1" max="${Math.min(S.balance,1e12)}" step="1" inputmode="numeric" placeholder="Например, 10000" required><p class="hint">Доступно: ${money(S.balance)}. Комиссия за передачу — 0%.</p>`:
  type==='plate'?`<label for="gift-asset">СВОБОДНЫЙ НОМЕР</label><select class="input" id="gift-asset" required><option value="">Выбери номер</option>${plates.map(g=>`<option value="${g.id}" ${g.id===selected?'selected':''}>${escapeHTML(g.plate)} · ${money(g.price)}</option>`).join('')}</select><p class="hint">Защищённые, установленные и выставленные на аукцион номера недоступны для передачи.</p>`:
  `<label for="gift-asset">МАШИНА</label><select class="input" id="gift-asset" required><option value="">Выбери машину</option>${cars.map(v=>`<option value="${v.id}" ${v.id===selected?'selected':''}>#${v.id} · ${escapeHTML(v.brand+' '+v.model)}${v.plate?' · '+escapeHTML(v.plate):''}</option>`).join('')}</select><label class="check-line"><input type="checkbox" id="gift-include-plate">Передать вместе с установленным номером</label><p class="hint">Без этой галочки номер остаётся у тебя. Защита машины и передаваемого номера должна быть снята.</p>`}
  <button class="primary full" type="submit" ${r?'':'disabled'}>Проверить передачу ${icon('arrow')}</button></form><p class="hint transfer-warning">Это подарок без встречной оплаты, не продажа. Передачу нельзя отменить. Полученные машины и номера автоматически защищаются.</p></section>
  <div class="row section-gap"><h2>История операций</h2><button class="text-btn" data-action="community-refresh">${icon('refresh')}Обновить</button></div>${communityStatus()}${ledgerHTML(CUI.ledger)}${communityPager(CUI.ledger,'ledger')}`;
}
function ledgerHTML(result){return `<div class="ledger-list">${result?.items.map(t=>`<article class="ledger-row"><div class="ledger-mark">${icon(t.kind.startsWith('transfer')?'gift':t.kind.includes('car')?'garage':'refresh')}</div><div class="grow"><h3>${escapeHTML(t.label)}</h3><p>${t.kind.startsWith('transfer')?(t.incoming?'От '+escapeHTML(t.details.sender_name||String(t.actor)):'Кому: '+escapeHTML(t.details.recipient_name||String(t.recipient))):({buy_car:'Покупка в автосалоне',sell_car:'Продажа дилеру',mount_plate:'Установка номера',unmount_plate:'Снятие номера'}[t.kind]||'Операция')}</p><small>#${t.id} · ${dateLabel(t.ts)}</small></div><strong>${t.amount?money(t.amount):''}</strong></article>`).join('')||'<div class="admin-placeholder">Операций пока нет.</div>'}</div>`;}
async function previewGift(){
  if(!CUI.recipient)return;
  const data={kind:CUI.transferKind,target_id:CUI.recipient.user_id};
  if(data.kind==='money')data.amount=Number($('#gift-amount').value);
  else data.asset_id=Number($('#gift-asset').value);
  if(data.kind==='car')data.include_plate=Boolean($('#gift-include-plate').checked);
  busy=true;setControlsBusy();
  try{
    const j=await request('transfer_preview',data);commit(j);
    const q=j.transfer_quote;
    confirmDialog('Подтвердить подарок',`<b>${escapeHTML(q.label)}</b>${q.kind==='car'?`<br>${q.include_plate?'Вместе с номером <b>'+escapeHTML(q.plate)+'</b>':'Без номера — номер остаётся у тебя.'}`:''}<br><br>Получатель: <b>${escapeHTML(q.target_name)}</b><br>${q.target_handle?'@'+escapeHTML(q.target_handle)+' · ':''}<b>ID ${q.target_id}</b><br><br>Без встречной оплаты. Отменить передачу нельзя.`,()=>communityWrite('community_action','transfer',{quote:q.token},()=>{CUI.transferAsset=null;}),'Передать подарок',true);
  }catch(e){notify(e.message,true);}finally{busy=false;setControlsBusy();}
}
function renderTitles(){
  const level=S.level||1;
  return `${heading('Титулы','Новый уровень — новый статус в коллекции.','ПРОГРЕСС',true)}
  <div class="level-panel"><div class="row"><div><div class="eyebrow">ТВОЙ УРОВЕНЬ</div><strong>${level}</strong></div>${icon('trophy')}</div><h2>${escapeHTML(S.title||'Новичок')}</h2><div class="quest-progress"><i style="width:${(S.level_progress||0)*10}%"></i></div><p class="hint">${level>=100?'Максимальный уровень достигнут.':`${S.next_level_in||10} прокрутов до следующего уровня.`} Один номер в прокрутке — 1 очко опыта; 10 очков — уровень.</p></div>
  <div class="titles-grid">${(S.titles||[]).map(t=>{const unlocked=level>=t.level;return `<article class="title-card ${unlocked?'unlocked':'locked'}">${icon(unlocked?'trophy':'shield')}<small>УРОВЕНЬ ${t.level}</small><h3>${escapeHTML(t.name)}</h3><button class="${S.title_id===t.id?'primary':'secondary'} full" data-action="title-select" data-title-id="${t.id}" ${!unlocked||S.title_id===t.id?'disabled':''}>${S.title_id===t.id?'Выбран':unlocked?'Надеть титул':'Пока закрыт'}</button></article>`;}).join('')}</div><p class="hint" style="margin-top:18px">Титулы косметические: не меняют шансы выпадения и не дают прав администратора.</p>`;
}
function renderInbox(){const items=CUI.inbox?.items||[];return `${heading('Уведомления','','ТВОЯ КОЛЛЕКЦИЯ',true)}<div class="row"><p class="hint">Новые подарки и действия команды</p><button class="secondary" data-action="notifications-read" ${items.length?'':'disabled'}>Прочитать все</button></div>${communityStatus()}<div class="inbox-list">${items.map(n=>`<article class="inbox-item ${n.is_read?'':'unread'}"><div class="row"><h3>${escapeHTML(n.title)}</h3><span class="hint">${dateLabel(n.ts)}</span></div><p>${escapeHTML(n.message)}</p></article>`).join('')||'<div class="admin-placeholder">Пока ничего нового.</div>'}</div>${communityPager(CUI.inbox,'inbox')}`;}
function renderSupport(){return `${heading('Поддержка и идеи','Напиши владельцу — по делу или с новой идеей.','ОБРАТНАЯ СВЯЗЬ',true)}
  <div class="support-grid"><article class="support-card">${icon('info')}<h2>Нужна помощь?</h2><p>Ошибка, вопрос об игре или проблема с доступом.</p><button class="secondary" data-action="owner-chat" data-kind="support">Написать в поддержку</button></article><article class="support-card">${icon('bolt')}<h2>Есть идея?</h2><p>Новая механика, машина или улучшение интерфейса.</p><button class="primary" data-action="owner-chat" data-kind="suggest">Предложить улучшение</button></article></div>
  <div class="info-card section-gap"><label for="support-message">СООБЩЕНИЕ — НЕОБЯЗАТЕЛЬНО</label><textarea class="input" id="support-message" rows="5" maxlength="1200" placeholder="Что произошло или что добавить?"></textarea><p class="hint">Кнопка откроет чат @${escapeHTML(S.support_handle||DONATE_HANDLE)} с подготовленным текстом. Отправку подтверждаешь ты в Telegram. Не указывай пароли и платёжные реквизиты.</p></div>`;}
function openOwnerChat(kind){
  const handle=/^[A-Za-z0-9_]{5,32}$/.test(S.support_handle||'')?S.support_handle:DONATE_HANDLE;
  const text=`${kind==='suggest'?'Предложение по Номерку':'Поддержка Номерка'}\nИгрок: ${S.public_profile?.name||user.first_name||'Игрок'}\nID: ${S.user_id||user.id||'демо'}\n${$('#support-message')?.value?.trim()||''}`;
  const url=`https://t.me/${handle}?text=${encodeURIComponent(text)}`;
  if(tg?.openTelegramLink)tg.openTelegramLink(url);else window.open(url,'_blank','noopener');
}
function roleRights(role){return role.permissions.map(p=>`<span class="quick-tag">${escapeHTML(CUI.roles?.permissions?.[p]||p)}</span>`).join('')||'<span class="hint">Без специальных прав</span>';}
function renderTeam(){
  if(!owner())return empty('shield','Только владелец','Назначение ролей недоступно.','В профиль','me');
  const data=CUI.roles;
  return `${heading('Команда и права','Своё название роли. Только выбранные разрешения.','ВЛАДЕЛЕЦ',true)}
  <div class="quick-nav"><button class="primary" data-action="role-new">${icon('gift')}Создать роль</button><button class="secondary" data-page="staff">Панель команды</button><button class="secondary" data-page="admin">Панель владельца</button></div>${communityStatus()}
  <div class="admin-notice">Назначать роли может только владелец. Сотрудники не могут менять себя, владельца и других сотрудников. Лимит выдач общий на человека за последние 24 часа.</div>
  <div class="roles-grid">${data?.roles.map(r=>`<article class="role-card"><div class="row"><h3>${escapeHTML(r.name)}</h3><span class="hint">#${r.id}</span></div><div class="quick-tags">${roleRights(r)}</div><p class="hint">Лимит экономических действий: ${money(r.daily_limit)} / 24 ч</p><div class="modal-buttons"><button class="secondary" data-action="role-edit" data-id="${r.id}">Изменить</button><button class="text-btn danger-text" data-action="role-delete" data-id="${r.id}">Удалить</button></div></article>`).join('')||'<div class="admin-placeholder">Создай первую роль из шаблона или с нуля.</div>'}</div>
  <section class="transfer-panel section-gap"><h2>Назначить роль</h2><form class="toolbar section-gap" id="team-search"><input class="input" id="team-query" placeholder="ID, имя или @username" aria-label="Найти участника" required><button class="secondary">Найти</button></form>${recipientResults(CUI.teamSearch,'team')}
  ${CUI.teamTarget?`<form id="role-assignment"><div class="chosen-recipient"><div><strong>${escapeHTML(CUI.teamTarget.name)}</strong><p>ID ${CUI.teamTarget.user_id}</p></div></div><label for="assign-role">РОЛЬ</label><select class="input" id="assign-role" required><option value="">Выбери роль</option>${data?.roles.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('')||''}</select><button class="primary full" type="submit">Назначить</button></form>`:''}</section>
  <h2 class="section-gap">Участники команды</h2><div class="people-list">${data?.members.map(m=>`<div class="person-row"><div class="person-info"><strong>${escapeHTML(m.name)}</strong><small>ID ${m.user_id}${m.handle?' · @'+escapeHTML(m.handle):''}</small><span class="person-title">${escapeHTML(m.role_name)}</span></div><button class="secondary" data-action="role-revoke" data-id="${m.user_id}">Снять роль</button></div>`).join('')||'<div class="admin-placeholder">Пока только владелец.</div>'}</div>`;
}
function editRole(id=0){
  if(!owner()||!CUI.roles)return;
  const r=CUI.roles.roles.find(r=>r.id===id)||{name:'',permissions:[],daily_limit:0};
  CUI.roleEditing=id;
  openDialog(id?'Изменить роль':'Новая роль',`<div class="chips">${CUI.roles.presets.map((p,i)=>`<button type="button" class="chip" data-action="role-preset" data-n="${i}">${nameHTML(p)}</button>`).join('')}</div>
  <form id="role-editor"><label for="role-name">НАЗВАНИЕ</label><input class="input" id="role-name" maxlength="32" minlength="2" required value="${escapeHTML(r.name)}" placeholder="Например, Старший модератор">
  <fieldset class="rights-grid"><legend>Разрешённые действия</legend>${Object.entries(CUI.roles.permissions).map(([k,label])=>`<label class="right-option"><input type="checkbox" name="permission" value="${k}" ${r.permissions.includes(k)?'checked':''}><span>${escapeHTML(label)}</span></label>`).join('')}</fieldset>
  <label for="role-limit">ЛИМИТ В ИГРОВЫХ ₽ ЗА 24 ЧАСА</label><input class="input" id="role-limit" type="number" step="1" min="0" max="9000000000000" value="${r.daily_limit}" required>
  <p class="hint">Выдача и списание денег, а также оценка выданных машин и номеров расходуют общий лимит сотрудника. 0 — эти операции запрещены. VIP и модерация разрешаются отдельными правами.</p>
  <div class="modal-buttons"><button class="secondary" type="button" data-action="close-dialog">Отмена</button><button class="primary" type="submit">Сохранить роль</button></div></form>`);
}
function renderStaff(){
  if(!S.staff?.name)return empty('shield','Доступ закрыт','Панель доступна участникам команды.','В профиль','me');
  const data=CUI.staffData,role=S.staff;
  const tabs=[['overview','Рабочий стол',null],['players','Игроки','players.read'],['plates','Номера','plates.read'],['stats','Статистика','stats.read'],['audit','Журнал','audit.read']].filter(t=>!t[2]||staffCan(t[2]));
  const ops=Object.keys(STAFF_NAMES).filter(k=>staffCan(STAFF_RIGHTS[k]));
  let body='';
  if(CUI.staffSection==='overview'){
    body=`<div class="admin-notice"><b>${escapeHTML(role.name)}</b><br>${owner()?'Полные права владельца.':`Использовано за 24 ч: ${money(data?.used||0)} из ${money(role.daily_limit)}.`}</div>
    ${ops.length?`<form class="staff-operation-form transfer-panel" id="staff-operation"><h2>Действие с игроком</h2>
    <label for="staff-target">TELEGRAM ID ИГРОКА</label><input class="input" type="number" id="staff-target" min="1" step="1" required value="${CUI.staffTarget||''}">
    <label for="staff-op">ОПЕРАЦИЯ</label><select class="input" id="staff-op">${ops.map(op=>`<option value="${op}">${STAFF_NAMES[op]}</option>`).join('')}</select>
    <div data-staff-field="amount"><label for="staff-amount">СУММА В ИГРОВЫХ ₽</label><input class="input" type="number" id="staff-amount" min="1" max="1000000000000" step="1"></div>
    <div data-staff-field="vip" hidden><label for="staff-vip">VIP</label><select class="input" id="staff-vip"><option value="0">Снять VIP</option><option value="3">×3</option><option value="5">×5</option><option value="10">×10</option></select></div>
    <div data-staff-field="rarity" hidden><label for="staff-rarity">РЕДКОСТЬ</label><select class="input" id="staff-rarity">${RARITIES.map((r,i)=>`<option value="${i+1}">${r}</option>`).join('')}</select></div>
    <div data-staff-field="car" hidden><label for="staff-car">МАШИНА</label><select class="input" id="staff-car">${CAR_CATALOG.map(v=>`<option value="${v.id}">${escapeHTML(v.brand+' '+v.model)} · ${money(v.price)}</option>`).join('')}</select></div>
    <label for="staff-reason">ПРИЧИНА</label><input class="input" id="staff-reason" minlength="3" maxlength="300" required placeholder="Почему выполняется действие?">
    <button class="primary full" type="submit">Проверить и подтвердить</button></form>`:'<div class="admin-placeholder">У роли нет прав на изменение аккаунтов. Используй доступные разделы просмотра.</div>'}`;
  }else if(['players','plates'].includes(CUI.staffSection)){
    body=`<form class="toolbar" id="staff-search"><input class="input" id="staff-query" placeholder="${CUI.staffSection==='players'?'ID, имя или @username':'Номер или часть комбинации'}" value="${escapeHTML(CUI.staffQuery)}"><button class="primary">Найти</button></form><div class="people-list">${data?.items?.map(r=>CUI.staffSection==='players'?`<div class="person-row"><div class="person-info"><strong>${escapeHTML(r.name)}</strong><small>ID ${r.user_id} · ${money(r.balance)}</small><span class="person-title">${r.banned?'Заблокирован':escapeHTML(r.staff_title||'Игрок')}</span></div><button class="secondary" data-action="staff-target" data-id="${r.user_id}">Выбрать</button></div>`:`<div class="person-row"><div class="person-info"><strong>${escapeHTML(r.plate)}</strong><small>${r.location==='market'?'На аукционе':'В гараже'} · Владелец ${r.user_id}</small></div><strong>${money(r.price)}</strong></div>`).join('')||'<div class="admin-placeholder">Нет записей.</div>'}</div>${communityPager(data,'staff')}`;
  }else if(CUI.staffSection==='stats'){
    body=`<div class="stats-grid">${Object.entries(data?.stats||{}).map(([k,v])=>`<div class="stat-card"><small>${{users:'ИГРОКОВ',cars:'МАШИН',plates:'НОМЕРОВ',transfers:'ПЕРЕДАЧ'}[k]||k}</small><strong>${fmt(v)}</strong></div>`).join('')}</div>`;
  }else if(CUI.staffSection==='audit'){
    body=`<div class="ledger-list">${data?.items?.map(r=>`<article class="inbox-item"><div class="row"><h3>#${r.id} · ${escapeHTML(STAFF_NAMES[r.op.replace('staff.','')]||r.op)}</h3><span class="hint">${dateLabel(r.ts)}</span></div><p>Сотрудник ${r.actor}${r.target?' → '+r.target:''}<br>${escapeHTML(r.reason)}</p><details><summary>Подробности</summary><pre>${escapeHTML(JSON.stringify({до:r.before,после:r.after},null,2))}</pre></details></article>`).join('')||'<div class="admin-placeholder">Записей пока нет.</div>'}</div>${communityPager(data,'staff')}`;
  }
  return `${heading('Панель команды',role.name,'УПРАВЛЕНИЕ',true)}${owner()?'<div class="quick-nav"><button class="secondary" data-page="team">Роли и права</button><button class="secondary" data-page="admin">Панель владельца</button></div>':''}
  <div class="chips">${tabs.map(([id,title])=>`<button class="chip ${CUI.staffSection===id?'active':''}" data-action="staff-tab" data-section="${id}">${title}</button>`).join('')}</div>${communityStatus()}${body}`;
}
function staffFields(){
  const op=$('#staff-op')?.value;if(!op)return;
  const field=['credit','debit'].includes(op)?'amount':op==='vip'?'vip':op==='grant_plate'?'rarity':op==='grant_car'?'car':'';
  $$('[data-staff-field]').forEach(e=>{e.hidden=e.dataset.staffField!==field;});
}
const previousRender=render;
render=function(){previousRender();if(!S)return;
  $('#community-pending')?.remove();
  if(pendingCommunity)$('#view').insertAdjacentHTML('afterbegin',`<div class="admin-notice warning" id="community-pending"><b>Есть неподтверждённая операция</b><p>Ответ мог потеряться. Проверка не выполняет покупку или передачу повторно.</p><button class="secondary" data-action="community-retry">Проверить операцию</button></div>`);
  if(page==='staff')staffFields();
  const inbox=$('#community-inbox');if(inbox){inbox.dataset.unread=String(S.unread_notifications||0);inbox.title=`Уведомления: ${S.unread_notifications||0}`;}
  if(page==='admin'&&owner()&&!$('#owner-team-link'))$('#view').insertAdjacentHTML('afterbegin','<div class="quick-nav" id="owner-team-link"><button class="primary" data-page="team">Роли и команда</button><button class="secondary" data-page="staff">Выдача машин</button></div>');
};
const previousHeader=updateHeader;
updateHeader=function(){previousHeader();if(!S)return;
  let b=$('#community-inbox');if(!b){b=document.createElement('button');b.id='community-inbox';b.className='icon-btn inbox-button';b.dataset.page='inbox';b.setAttribute('aria-label','Уведомления');b.innerHTML=icon('quests');$('#sound-button').before(b);}
  b.dataset.unread=String(S.unread_notifications||0);
  const admin=$('#admin-entry');if(admin){admin.hidden=!S.staff?.name&&!S.is_admin;admin.dataset.page=S.is_admin?'admin':'staff';}
  $$('[data-page].nav-item').forEach(n=>{const active=n.dataset.page===page||(page==='fleet'&&n.dataset.page==='garage')||(['player','transfers'].includes(page)&&n.dataset.page==='people')||(['titles','team','staff','support','inbox'].includes(page)&&n.dataset.page==='me');if(active)n.classList.add('active');});
};
const previousGarage=renderGarage;
renderGarage=function(){return pageTools()+previousGarage();};
const previousResultDetail=resultDetail;
resultDetail=function(id){
  previousResultDetail(id);const g=S.garage.find(g=>g.id===id);
  if(!g||$('#dialog').hidden)return;
  if(g.mounted_car_id){$('#dialog-content').insertAdjacentHTML('beforeend',`<div class="admin-notice">Установлен на машине #${g.mounted_car_id}. Сними его перед продажей или передачей.<button class="secondary" data-action="vehicle-detail" data-id="${g.mounted_car_id}">К машине</button></div>`);$$('#dialog-content [data-action="result-sell"],#dialog-content [data-action="result-list"]').forEach(b=>b.disabled=true);}
  else $('#dialog-content').insertAdjacentHTML('beforeend',`<button class="secondary full section-gap" data-action="plate-gift" data-id="${id}" ${g.fav?'disabled':''}>${icon('gift')}Передать игроку</button>`);
};
const previousSell=sellDialog,previousList=listDialog;
sellDialog=function(id){if(S.garage.find(g=>g.id===id)?.mounted_car_id)return notify('Сначала сними номер с машины.',true);previousSell(id);};
listDialog=function(id){if(S.garage.find(g=>g.id===id)?.mounted_car_id)return notify('Сначала сними номер с машины.',true);previousList(id);};
const previousHandle=handleAction;
handleAction=async function(button){
  const a=button.dataset.action,id=Number(button.dataset.id),n=Number(button.dataset.n),v=ownedCar(id);
  switch(a){
    case 'community-refresh':return loadCommunity(page);
    case 'community-retry':return communityWrite(null,null,{},null,true);
    case 'open-player':return openPlayer(id);
    case 'gift-to-player':if(!CUI.player)return;CUI.recipient=CUI.player;CUI.transferAsset=null;closeDialog();return navigate('transfers');
    case 'copy-player':try{await navigator.clipboard.writeText(String(CUI.player.user_id));notify('ID скопирован.');}catch{notify('ID игрока: '+CUI.player.user_id);}return;
    case 'public-inventory':CUI.inventoryKind=button.dataset.kind;CUI.inventoryPage=0;return loadCommunity('player');
    case 'car-buy-confirm':return buyCarConfirm(button.dataset.carId);
    case 'vehicle-detail':return vehicleDetail(id);
    case 'mount-picker':return mountPicker(id);
    case 'mount-confirm':{if(!v)return;const plateId=Number($('#mount-plate-select')?.value),g=S.garage.find(x=>x.id===plateId);if(!g)return;return confirmDialog('Установить номер?',`${escapeHTML(g.plate)} → ${escapeHTML(v.brand+' '+v.model)} #${v.id}`,()=>communityWrite('community_action','mount_plate',{car_id:id,plate_id:plateId,expected_plate_id:v.plate_id},()=>vehicleDetail(id)),'Установить');}
    case 'unmount-confirm':if(!v)return;return confirmDialog('Снять номер?',`${escapeHTML(v.plate)} останется в твоём гараже.`,()=>communityWrite('community_action','unmount_plate',{car_id:id,expected_plate_id:v.plate_id},()=>vehicleDetail(id)),'Снять');
    case 'vehicle-protect':if(!v)return;return communityWrite('community_action','protect_car',{car_id:id,protected:!v.protected},()=>vehicleDetail(id));
    case 'vehicle-showcase':return communityWrite('community_action','showcase_car',{car_id:id},()=>vehicleDetail(id));
    case 'vehicle-sell':if(!v)return;return confirmDialog('Продать дилеру?',`${escapeHTML(v.brand+' '+v.model)} #${id}<br>Получишь <b>${money(Math.floor(v.value*.75))}</b> (75%).${v.plate?'<br>Номер '+escapeHTML(v.plate)+' останется в твоём гараже.':''}`,()=>communityWrite('community_action','sell_car',{car_id:id,expected_plate_id:v.plate_id,expected_refund:Math.floor(v.value*.75)}),'Продать',true);
    case 'vehicle-gift':CUI.transferKind='car';CUI.transferAsset=id;closeDialog();return navigate('transfers');
    case 'plate-gift':CUI.transferKind='plate';CUI.transferAsset=id;closeDialog();return navigate('transfers');
    case 'transfer-kind':CUI.transferKind=button.dataset.kind;CUI.transferAsset=null;render();return;
    case 'transfer-recipient':CUI.recipient=CUI.recipientResults?.items.find(p=>p.user_id===id)||null;render();return;
    case 'recipient-clear':CUI.recipient=null;CUI.recipientResults=null;render();return;
    case 'title-select':return communityWrite('community_action','set_title',{title_id:button.dataset.titleId});
    case 'notifications-read':return communityWrite('community_action','mark_read',{until_id:Math.max(0,...(CUI.inbox?.items||[]).map(v=>v.id))});
    case 'owner-chat':return openOwnerChat(button.dataset.kind);
    case 'role-new':return editRole();
    case 'role-edit':return editRole(id);
    case 'role-preset':{const p=CUI.roles?.presets[n];if(!p)return;$('#role-name').value=p.name;$('#role-limit').value=p.daily_limit;$$('#role-editor [name="permission"]').forEach(x=>x.checked=p.permissions.includes(x.value));return;}
    case 'team-recipient':CUI.teamTarget=CUI.teamSearch?.items.find(p=>p.user_id===id)||null;render();return;
    case 'role-delete':{const r=CUI.roles?.roles.find(r=>r.id===id);if(!r)return;const count=CUI.roles.members.filter(m=>m.role_id===id).length;return confirmDialog('Удалить роль?',`Роль «${escapeHTML(r.name)}» будет удалена. Участников, которые потеряют права: <b>${count}</b>.`,()=>communityWrite('role_action','delete',{role_id:id,revision:r.revision}),'Удалить',true);}
    case 'role-revoke':{const m=CUI.roles?.members.find(m=>m.user_id===id);if(!m)return;return confirmDialog('Снять роль?',`${escapeHTML(m.name)} · ID ${id}<br>Права «${escapeHTML(m.role_name)}» будут отозваны.`,()=>communityWrite('role_action','revoke',{user_id:id,expected_role_id:m.role_id}),'Снять права',true);}
    case 'staff-tab':CUI.staffSection=button.dataset.section;CUI.staffPage=0;CUI.staffData=null;return loadCommunity('staff');
    case 'staff-target':CUI.staffTarget=id;CUI.staffSection='overview';return loadCommunity('staff');
    case 'community-page':{const key={people:'peoplePage',inventory:'inventoryPage',ledger:'ledgerPage',inbox:'inboxPage',staff:'staffPage'}[button.dataset.scope];if(key)CUI[key]=n;return loadCommunity(page);}
    default:return previousHandle(button);
  }
};
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(!['people-search','transfer-search','transfer-form','team-search','role-editor','role-assignment','staff-operation','staff-search'].includes(form.id))return;
  event.preventDefault();
  if(busy||spinning)return;
  try{
    if(form.id==='people-search'){CUI.query=$('#people-query').value.trim();CUI.peoplePage=0;return loadCommunity('people');}
    if(form.id==='staff-search'){CUI.staffQuery=$('#staff-query').value.trim();CUI.staffPage=0;return loadCommunity('staff');}
    if(form.id==='transfer-form')return previewGift();
    if(form.id==='transfer-search'||form.id==='team-search'){
      const team=form.id==='team-search',input=team?'#team-query':'#recipient-query';
      busy=true;const btn=form.querySelector('button');btn.disabled=true;
      try{const j=await request('people',{query:$(input).value.trim()});commit(j);
        if(team)CUI.teamSearch=j.people;else CUI.recipientResults={...j.people,items:j.people.items.filter(p=>p.user_id!==S.user_id)};
      }finally{busy=false;render();}return;
    }
    if(form.id==='role-editor'){
      const r=CUI.roles.roles.find(r=>r.id===CUI.roleEditing);
      const data={name:$('#role-name').value.trim(),permissions:$$('#role-editor [name="permission"]:checked').map(x=>x.value),daily_limit:Number($('#role-limit').value)};
      if(r)Object.assign(data,{role_id:r.id,revision:r.revision});
      const op=r?'update':'create';
      return confirmDialog('Сохранить права?',`<b>${escapeHTML(data.name)}</b><br>${data.permissions.map(k=>escapeHTML(CUI.roles.permissions[k])).join('<br>')||'Без специальных прав'}<br><br>Лимит: ${money(data.daily_limit)} / 24 ч.`,()=>communityWrite('role_action',op,data),'Сохранить');
    }
    if(form.id==='role-assignment'){
      const r=CUI.roles.roles.find(r=>r.id===Number($('#assign-role').value)),p=CUI.teamTarget;if(!r||!p)return;
      return confirmDialog('Назначить роль?',`${nameHTML(p)} · <b>ID ${p.user_id}</b><br>Роль: <b>${escapeHTML(r.name)}</b><br>${r.permissions.map(k=>escapeHTML(CUI.roles.permissions[k])).join('<br>')||'Без специальных прав'}`,()=>communityWrite('role_action','assign',{user_id:p.user_id,role_id:r.id,revision:r.revision}),'Назначить');
    }
    if(form.id==='staff-operation'){
      const op=$('#staff-op').value,target=Number($('#staff-target').value);
      const data={user_id:target,confirm_target:target,reason:$('#staff-reason').value.trim()};
      let detail='';
      if(['credit','debit'].includes(op)){data.amount=Number($('#staff-amount').value);detail=money(data.amount);}
      if(op==='vip'){data.level=Number($('#staff-vip').value);detail=data.level?'VIP ×'+data.level:'Снять VIP';}
      if(op==='grant_plate'){data.rarity=Number($('#staff-rarity').value);detail=RARITIES[data.rarity-1];}
      if(op==='grant_car'){data.model_id=$('#staff-car').value;const c=carModel(data.model_id);detail=c.brand+' '+c.model+' · '+money(c.price);}
      return confirmDialog('Подтвердить действие?',`<b>${escapeHTML(STAFF_NAMES[op])}</b><br>Игрок: <b>ID ${target}</b><br>${escapeHTML(detail)}<br>Причина: ${escapeHTML(data.reason)}`,()=>communityWrite('staff_action',op,data),'Выполнить',['debit','ban'].includes(op));
    }
  }catch(e){busy=false;notify(e.message||'Не удалось выполнить действие.',true);}
});
document.addEventListener('change',event=>{
  if(event.target.id==='staff-op')staffFields();
  if(event.target.id==='car-sort'){CUI.carSort=event.target.value;render();}
});
let carSearchTimer;
document.addEventListener('input',event=>{if(event.target.id==='car-search'){CUI.carQuery=event.target.value;clearTimeout(carSearchTimer);carSearchTimer=setTimeout(()=>{if(page==='cars'){const start=event.target.selectionStart;render();const el=$('#car-search');el?.focus();el?.setSelectionRange(start,start);}},300);}});
/* Demo is clearly labelled and has no write path to a production account. */
function demoProfile(){
  const d=demoDB||S,level=Math.min(100,Math.floor(d.spins/10)+1);
  const plates=d.garage.reduce((a,g)=>a+g.price,0),cars=(d.cars||[]).reduce((a,g)=>a+g.value,0);
  const titles=d.titles||DEMO_TITLES,unlocked=titles.filter(t=>t.level<=level),t=unlocked.find(t=>t.id===d.title_id)||unlocked.at(-1);
  return {user_id:d.user_id||1001,name:'Коллекционер',handle:'',balance:d.balance,spins:d.spins,vip:d.vip,plate_count:d.garage.length,market_count:0,market_worth:0,plate_worth:plates,car_count:(d.cars||[]).length,car_worth:cars,total_worth:d.balance+plates+cars,staff_title:'',is_owner:false,level,title:t.name,title_id:t.id,showcase:(d.cars||[]).find(v=>v.showcased)||null};
}
const DEMO_TITLES=[{id:'rookie',level:1,name:'Новичок'},{id:'driver',level:5,name:'Водитель'},{id:'collector',level:10,name:'Коллекционер'},{id:'connoisseur',level:20,name:'Знаток номеров'},{id:'magnate',level:35,name:'Гаражный магнат'},{id:'fleet',level:50,name:'Владелец автопарка'},{id:'hunter',level:75,name:'Охотник за легендами'},{id:'legend',level:100,name:'Легенда дорог'}];
const originalDemoRequest=demoRequest;
demoRequest=async function(action,data){
  if(!demoDB)seedDemo();
  const d=demoDB;d.user_id=1001;d.cars=d.cars||[];d.staff={owner:false,name:'',permissions:[]};d.titles=DEMO_TITLES;d.support_handle=DONATE_HANDLE;d.unread_notifications=0;d.catalog_version='demo6';d.version='6.0';
  if(!d.communitySeeded){d.communitySeeded=true;d.balance=32000000;}
  let extra={};
  if(action==='catalog')extra.catalog=CAR_CATALOG.map(c=>({id:c.id,brand:c.brand,model:c.model,price:c.price,rarity:c.rarity}));
  else if(action==='people')extra.people={items:[{...demoProfile(),user_id:2002,name:'Алексей',balance:2000000,plate_worth:10000000,car_worth:20000000,total_worth:32000000}],total:1,page:0,page_size:20};
  else if(action==='player')extra.player={...demoProfile(),user_id:data.user_id,name:'Алексей'};
  else if(action==='inventory')extra.inventory={items:[],total:0,page:0,page_size:20,kind:data.kind};
  else if(['ledger','inbox'].includes(action))extra[action]={items:[],total:0,page:0,page_size:20};
  else if(['roles','role_action','staff','staff_action','transfer_preview'].includes(action))throw new RequestError('В демо передачи и управление командой отключены.');
  else if(action==='community_action'){
    const op=data.op;
    if(op==='buy_car'){const c=carModel(data.model_id);if(!c||d.balance<c.price)throw new RequestError('Недостаточно игровых ₽.');d.balance-=c.price;d.cars.push({...c,id:demoNext++,model_id:c.id,value:c.price,paid:c.price,protected:0,showcased:0,plate_id:null,plate:null});}
    else if(op==='set_title')d.title_id=data.title_id;
    else if(['mount_plate','unmount_plate','protect_car','showcase_car','sell_car'].includes(op)){
      const v=d.cars.find(v=>v.id===data.car_id);if(!v)throw new RequestError('Машина не найдена.');
      if(op==='protect_car')v.protected=data.protected?1:0;
      else if(op==='showcase_car'){d.cars.forEach(c=>c.showcased=0);v.showcased=1;}
      else if(op==='sell_car'){if(v.protected)throw new RequestError('Машина защищена.');d.balance+=Math.floor(v.value*.75);d.cars=d.cars.filter(c=>c.id!==v.id);d.garage.forEach(g=>{if(g.mounted_car_id===v.id)g.mounted_car_id=null;});}
      else{const p=op==='mount_plate'?d.garage.find(p=>p.id===data.plate_id):null;if(p?.mounted_car_id&&p.mounted_car_id!==v.id)throw new RequestError('Номер занят.');d.garage.forEach(g=>{if(g.mounted_car_id===v.id)g.mounted_car_id=null;});if(p)p.mounted_car_id=v.id;v.plate_id=p?.id||null;v.plate=p?.plate||null;v.plate_value=p?.price||0;}
    }else throw new RequestError('Это действие отключено в демо.');
    extra.message='Готово в демо-режиме.';
  }else{const j=await originalDemoRequest(action,data);extra={...j};if(action==='top')extra.top=[{...demoProfile(),worth:demoProfile().total_worth}];}
  d.public_profile=demoProfile();Object.assign(d,{level:d.public_profile.level,title:d.public_profile.title,title_id:d.public_profile.title_id,level_progress:d.spins%10,next_level_in:10-d.spins%10});
  return JSON.parse(JSON.stringify({...d,...extra,public_profile:d.public_profile,staff:d.staff,version:'6.0'}));
};

