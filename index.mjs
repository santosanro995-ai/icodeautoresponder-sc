import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import {Strategy as GitHubStrategy} from 'passport-github2';
import makeWASocket,{DisconnectReason,useMultiFileAuthState,fetchLatestBaileysVersion,Browsers,delay,downloadMediaMessage} from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import crypto from 'crypto';
import pino from 'pino';
import axios from 'axios';
import XLSX from 'xlsx';
import nodemailer from 'nodemailer';
import {detectPromotion,detectUnsafeContent,mentionText,normalizeAntiPromo,DEFAULT_ANTI_PROMO} from './anti-promo.mjs';

const __filename=fileURLToPath(import.meta.url),__dirname=path.dirname(__filename),app=express();
const PORT=process.env.PORT||8080,VERSION='public',CHANGELOG='Migrasi ke InstanLive payment gateway';
const SESSION_FOLDER='./sessions',BASE_URL=process.env.BASE_URL||`http://localhost:${PORT}`;
const SYSTEM_BOT_PHONE=process.env.SYSTEM_BOT_PHONE||'6283178438341',SYSTEM_BOT_NAME=process.env.SYSTEM_BOT_NAME||'TungTung Bot',SYSTEM_BOT_PHONE_2=process.env.SYSTEM_BOT_PHONE_2||SYSTEM_BOT_PHONE,SYSTEM_BOT_NAME_2=process.env.SYSTEM_BOT_NAME_2||'TralalaBot',SYSTEM_BOT_IMAGE=process.env.SYSTEM_BOT_IMAGE||'/image/system-bot-profile.png';
const BANNED_IP_FILE='./data/banned_ips.json',VIOLATION_FILE='./data/violations.json',SERVER_TOKENS_FILE='./data/server_tokens.json',COUPON_FILE='./data/coupons.json',AFFILIATE_FILE='./data/affiliates.json';
const ADMIN_CODE=process.env.ADMIN_CODE||'icode123';
const INSTANLIVE_API_KEY=process.env.INSTANLIVE_API_KEY||process.env.AUSTIN_API_KEY;
const INSTANLIVE_API_BASE_URL=process.env.INSTANLIVE_API_BASE_URL||process.env.AUSTIN_API_BASE_URL||'https://pay.instanlive.id/api/v1',INSTANLIVE_DEPOSIT_URL=process.env.INSTANLIVE_DEPOSIT_URL||process.env.AUSTIN_DEPOSIT_URL||`${INSTANLIVE_API_BASE_URL}/transaction/create`,INSTANLIVE_CALLBACK_URL=process.env.INSTANLIVE_CALLBACK_URL||process.env.AUSTIN_CALLBACK_URL||`${BASE_URL}/api/billing/callback-instanlive`;
const XENDIT_SECRET_KEY=process.env.XENDIT_SECRET_KEY||'',XENDIT_CALLBACK_TOKEN=process.env.XENDIT_CALLBACK_TOKEN||'',XENDIT_INVOICE_URL='https://api.xendit.co/v2/invoices';
const AUSTIN_METHODS=[['qris','QRIS','https://cdn-icons-png.flaticon.com/512/5968/5968705.png']];
const IMAGE_DATABASE_DIR='./img-database',IMAGE_DATABASE_FILE=`${IMAGE_DATABASE_DIR}/index.txt`;
function syncImageDatabase(){
  if(!fs.existsSync(IMAGE_DATABASE_DIR))fs.mkdirSync(IMAGE_DATABASE_DIR,{recursive:true});
  const entries=new Map();
  if(fs.existsSync(IMAGE_DATABASE_FILE))for(const line of fs.readFileSync(IMAGE_DATABASE_FILE,'utf8').split(/\r?\n/)){const match=line.match(/^\s*([^=]+?)\s*=\s*(https?:\/\/\S+)\s*$/);if(match)entries.set(match[1].trim(),match[2])}
  for(const[code,,imageUrl]of AUSTIN_METHODS)if(imageUrl)entries.set(code,imageUrl);
  fs.writeFileSync(IMAGE_DATABASE_FILE,[...entries].map(([name,url])=>`${name} = ${url}`).join('\n')+'\n');
}
syncImageDatabase();

function getInstanliveHeaders(){return{'Content-Type':'application/json','Accept':'application/json','X-Api-Key':INSTANLIVE_API_KEY}}
function getXenditHeaders(){return{Authorization:`Basic ${Buffer.from(`${XENDIT_SECRET_KEY}:`).toString('base64')}`,'Content-Type':'application/json','Accept':'application/json'}}
const AUSTIN_API_KEY=INSTANLIVE_API_KEY,AUSTIN_API_SECRET=INSTANLIVE_API_KEY,AUSTIN_API_BASE_URL=INSTANLIVE_API_BASE_URL;
function getAustinHeaders(){return getInstanliveHeaders()}

['./data',SESSION_FOLDER].forEach(d=>{if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true})});
[BANNED_IP_FILE,VIOLATION_FILE,SERVER_TOKENS_FILE,COUPON_FILE,AFFILIATE_FILE].forEach(f=>{if(!fs.existsSync(f))fs.writeFileSync(f,'[]')});

let bannedIPs=new Set(JSON.parse(fs.readFileSync(BANNED_IP_FILE))),ipViolations=new Map(JSON.parse(fs.readFileSync(VIOLATION_FILE))),socks={},socketInfo={},lastQr={},lastCode={},userEmails={},disconnectTimers={},authPanelKeys={},profileImages={};
const MAX_VIOLATIONS=20,VIOLATION_WINDOW=60*60*1000;
const LIMITS={Gratis:{wa:1,autoReply:100,api:500},Junior:{wa:3,autoReply:-1,api:10000},Senior:{wa:10,autoReply:-1,api:-1}};
const countryCodes=[['Afghanistan','93'],['Albania','355'],['Algeria','213'],['American Samoa','1684'],['Andorra','376'],['Angola','244'],['Anguilla','1264'],['Antigua dan Barbuda','1268'],['Argentina','54'],['Armenia','374'],['Aruba','297'],['Australia','61'],['Austria','43'],['Azerbaijan','994'],['Bahamas','1242'],['Bahrain','973'],['Bangladesh','880'],['Barbados','1246'],['Belarus','375'],['Belgium','32'],['Belize','501'],['Benin','229'],['Bermuda','1441'],['Bhutan','975'],['Bolivia','591'],['Bosnia dan Herzegovina','387'],['Botswana','267'],['Brazil','55'],['Brunei','673'],['Bulgaria','359'],['Burkina Faso','226'],['Burundi','257'],['Kamboja','855'],['Kamerun','237'],['Kanada','1'],['Cape Verde','238'],['Cayman Islands','1345'],['Chad','235'],['Chile','56'],['China','86'],['Kolombia','57'],['Komoro','269'],['Kosta Rika','506'],['Kroasia','385'],['Kuba','53'],['Siprus','357'],['Ceko','420'],['Denmark','45'],['Djibouti','253'],['Dominika','1767'],['Republik Dominika','1809'],['Ekuador','593'],['Mesir','20'],['El Salvador','503'],['Eritrea','291'],['Estonia','372'],['Eswatini','268'],['Ethiopia','251'],['Fiji','679'],['Finlandia','358'],['Prancis','33'],['Polinesia Prancis','689'],['Gabon','241'],['Gambia','220'],['Georgia','995'],['Jerman','49'],['Ghana','233'],['Gibraltar','350'],['Yunani','30'],['Grenada','1473'],['Guam','1671'],['Guatemala','502'],['Guinea','224'],['Guyana','592'],['Haiti','509'],['Honduras','504'],['Hong Kong','852'],['Hungaria','36'],['Islandia','354'],['India','91'],['Indonesia','62'],['Iran','98'],['Irak','964'],['Irlandia','353'],['Israel','972'],['Italia','39'],['Jamaika','1876'],['Jepang','81'],['Yordania','962'],['Kazakhstan','7'],['Kenya','254'],['Kiribati','686'],['Kuwait','965'],['Kirgizstan','996'],['Laos','856'],['Latvia','371'],['Lebanon','961'],['Lesotho','266'],['Liberia','231'],['Libya','218'],['Liechtenstein','423'],['Lithuania','370'],['Luksemburg','352'],['Makau','853'],['Madagaskar','261'],['Malawi','265'],['Malaysia','60'],['Maladewa','960'],['Mali','223'],['Malta','356'],['Marshall Islands','692'],['Mauritania','222'],['Mauritius','230'],['Meksiko','52'],['Mikronesia','691'],['Moldova','373'],['Monako','377'],['Mongolia','976'],['Montenegro','382'],['Maroko','212'],['Mozambik','258'],['Myanmar','95'],['Namibia','264'],['Nauru','674'],['Nepal','977'],['Belanda','31'],['Kaledonia Baru','687'],['Selandia Baru','64'],['Nikaragua','505'],['Niger','227'],['Nigeria','234'],['Korea Utara','850'],['Makedonia Utara','389'],['Norwegia','47'],['Oman','968'],['Pakistan','92'],['Palau','680'],['Panama','507'],['Papua Nugini','675'],['Paraguay','595'],['Peru','51'],['Filipina','63'],['Polandia','48'],['Portugal','351'],['Puerto Rico','1787'],['Qatar','974'],['Rumania','40'],['Rusia','7'],['Rwanda','250'],['Saint Lucia','1758'],['Samoa','685'],['San Marino','378'],['Arab Saudi','966'],['Senegal','221'],['Serbia','381'],['Seychelles','248'],['Sierra Leone','232'],['Singapura','65'],['Slovakia','421'],['Slovenia','386'],['Somalia','252'],['Afrika Selatan','27'],['Korea Selatan','82'],['Spanyol','34'],['Sri Lanka','94'],['Sudan','249'],['Suriname','597'],['Swedia','46'],['Swiss','41'],['Suriah','963'],['Taiwan','886'],['Tajikistan','992'],['Tanzania','255'],['Thailand','66'],['Timor-Leste','670'],['Togo','228'],['Tonga','676'],['Trinidad dan Tobago','1868'],['Tunisia','216'],['Turki','90'],['Turkmenistan','993'],['Tuvalu','688'],['Uganda','256'],['Ukraina','380'],['Uni Emirat Arab','971'],['Inggris','44'],['Amerika Serikat','1'],['Uruguay','598'],['Uzbekistan','998'],['Vanuatu','678'],['Vatikan','39'],['Venezuela','58'],['Vietnam','84'],['Yaman','967'],['Zambia','260'],['Zimbabwe','263']];
const countries=countryCodes.map(([name,code])=>({name,code}));
const countryCodeByIso={ID:'62',MY:'60',SG:'65',US:'1',PH:'63',TH:'66',VN:'84',JP:'81',KR:'82',CN:'86',IN:'91',GB:'44',AU:'61',DE:'49',FR:'33',IT:'39',ES:'34',RU:'7',CA:'1',BR:'55',NL:'31',SA:'966',AE:'971',TR:'90',TW:'886',HK:'852',NZ:'64',PK:'92',BD:'880',NG:'234',ZA:'27',EG:'20'};
function getPreferredCountryCode(req){
  const headerCountry=req.headers['cf-ipcountry']||req.headers['x-vercel-ip-country']||req.headers['fastly-client-country']||req.headers['x-country-code'];
  if(headerCountry){const code=countryCodeByIso[String(headerCountry).toUpperCase()];if(code)return code}
  const language=String(req.headers['accept-language']||'').match(/(?:^|,|;)([a-z]{2,3})[-_]([A-Z]{2})/);
  return language?.[2]&&countryCodeByIso[language[2].toUpperCase()]||'62';
}
const REGIONAL_PRICING={IDR:{currency:'IDR',symbol:'Rp',junior:50000,senior:150000},MYR:{currency:'MYR',symbol:'RM',junior:15,senior:45},SGD:{currency:'SGD',symbol:'S$',junior:5,senior:15},USD:{currency:'USD',symbol:'$',junior:3,senior:9},PHP:{currency:'PHP',symbol:'₱',junior:220,senior:660}};
const COUNTRY_REGION={62:'IDR',60:'MYR',65:'SGD',1:'USD',63:'PHP',66:'USD',84:'USD',81:'USD',82:'USD',86:'USD',91:'USD',44:'USD',49:'USD',33:'USD',39:'USD',34:'USD',7:'USD'};
function getRegionalPricing(countryCode='62'){const region=COUNTRY_REGION[String(countryCode)]||'USD';return{region,...REGIONAL_PRICING[region]}}

function saveBannedIPs(){fs.writeFileSync(BANNED_IP_FILE,JSON.stringify([...bannedIPs]))}
function saveViolations(){fs.writeFileSync(VIOLATION_FILE,JSON.stringify([...ipViolations]))}
function getClientIP(req){return req.headers['x-forwarded-for']?.split(',')[0].trim()||req.socket.remoteAddress}
function checkIPBan(req,res,next){const ip=getClientIP(req);if(ip==='::1'||ip==='127.0.0.1')return next();if(bannedIPs.has(ip))return res.status(403).json({error:'IP Anda diblokir permanen karena spam'});next()}
function recordViolation(ip){const now=Date.now();if(!ipViolations.has(ip))ipViolations.set(ip,{count:1,lastTime:now});else{const d=ipViolations.get(ip);if(now-d.lastTime>VIOLATION_WINDOW)d.count=1;else d.count++;d.lastTime=now;if(d.count>=MAX_VIOLATIONS){bannedIPs.add(ip);saveBannedIPs()}}saveViolations()}

const getBillingPath=u=>`./data/billing_${u}.json`,getUsagePath=u=>`./data/usage_${u}.json`,getStatsPath=u=>`./data/stats_${u}.json`,getUserDataPath=u=>`./data/replies_${u}.json`,getAntiPromoPath=u=>`./data/anti_promo_${u}.json`,getBotSettingsPath=u=>`./data/bot_settings_${u}.json`,getAnalyticsPath=u=>`./data/analytics_${u}.json`,getUserSessionPath=(u,d='device-1')=>d==='device-1'?`${SESSION_FOLDER}/${u}`:`${SESSION_FOLDER}/${u}/${d}`,getApiKeysPath=u=>`./data/apikeys_${u}.json`;
const deviceKey=(userId,deviceId)=>`${userId}::${deviceId}`;
function safeDeviceId(value){const deviceId=String(value||'device-1').trim();return/^[a-zA-Z0-9_-]{1,40}$/.test(deviceId)?deviceId:'device-1'}
function getDeviceIds(userId){const root=getUserSessionPath(userId),ids=[];if(fs.existsSync(`${root}/creds.json`))ids.push('device-1');if(fs.existsSync(root)){for(const entry of fs.readdirSync(root,{withFileTypes:true}))if(entry.isDirectory()&&fs.existsSync(`${root}/${entry.name}/creds.json`))ids.push(entry.name)}return[...new Set(ids)]}
function getUserSocket(userId,deviceId){const requested=deviceId?safeDeviceId(deviceId):null;const key=requested&&deviceKey(userId,requested);if(key&&socks[key])return socks[key];for(const [socketKey,info] of Object.entries(socketInfo))if(info.userId===userId&&socks[socketKey]?.user)return socks[socketKey];return null}
function getConnectedDevices(userId){return Object.entries(socketInfo).filter(([key,info])=>info.userId===userId&&socks[key]?.user).map(([,info])=>info.deviceId)}
function getUserDeviceCount(userId){return new Set([...getDeviceIds(userId),...Object.values(socketInfo).filter(info=>info.userId===userId).map(info=>info.deviceId)]).size}

function readJson(file,fallback){try{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback}catch{return fallback}}
function writeJson(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2))}
function getAnalytics(userId){return readJson(getAnalyticsPath(userId),{messages:[],keywords:{},responseTimes:[]})}
function recordIncoming(userId,text,receivedAt=Date.now()){const analytics=getAnalytics(userId);analytics.messages.push({text:String(text||''),receivedAt});if(analytics.messages.length>5000)analytics.messages.shift();for(const word of String(text||'').toLowerCase().match(/[a-z0-9_]{3,}/g)||[]){analytics.keywords[word]=(analytics.keywords[word]||0)+1}writeJson(getAnalyticsPath(userId),analytics);return receivedAt}
function recordResponse(userId,receivedAt,sentAt=Date.now()){const analytics=getAnalytics(userId);analytics.responseTimes.push({receivedAt,sentAt,ms:Math.max(0,sentAt-receivedAt)});if(analytics.responseTimes.length>5000)analytics.responseTimes.shift();writeJson(getAnalyticsPath(userId),analytics)}
function ensureTrial(user){if(!user?.id)return;const file=getBillingPath(user.id);if(fs.existsSync(file))return;const trialDays=Math.max(0,Number(process.env.TRIAL_DAYS||7));const now=Date.now();writeJson(file,{plan:trialDays?'Junior':'Gratis',trial:trialDays>0,trialStarted:now,expired:trialDays?now+trialDays*86400000:0,sisaHari:trialDays})}
function csvValue(value){const text=String(value??'');return/[",\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}
function exportRows(type,userId){if(type==='messages')return readJson(`./data/orders_${userId}.json`,[]);if(type==='contacts'){const rows=readJson(`./data/orders_${userId}.json`,[]),seen=new Set();return rows.filter(row=>{if(seen.has(row.number))return false;seen.add(row.number);return true}).map(row=>({number:row.number,firstMessage:row.message,lastSeen:row.time}))}if(type==='transactions'){return fs.readdirSync('./data').filter(file=>file.startsWith('pending_')&&file.endsWith('.json')).map(file=>readJson(`./data/${file}`,null)).filter(row=>row?.userId===userId)}return[]}
function sendEmail(to,subject,text){if(!to||!process.env.SMTP_HOST)return Promise.resolve(false);const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});return transporter.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject,text}).then(()=>true).catch(error=>{console.error('[EMAIL]',error.message);return false})}
function applyAffiliateCommission(userId,amount){const affiliates=readJson(AFFILIATE_FILE,[]),buyer=affiliates.find(item=>item.userId===userId);if(!buyer?.referredBy)return;const owner=affiliates.find(item=>item.referralCode===buyer.referredBy);if(!owner)return;const commission=Math.round(Number(amount||0)*Number(process.env.AFFILIATE_COMMISSION_PERCENT||10)/100);owner.commission=(owner.commission||0)+commission;owner.referrals=owner.referrals||[];if(!owner.referrals.some(item=>item.userId===userId))owner.referrals.push({userId,amount:commission,createdAt:Date.now()});writeJson(AFFILIATE_FILE,affiliates)}

function getUserBilling(userId){const p=getBillingPath(userId);if(!fs.existsSync(p))return{plan:'Gratis',sisaHari:0,expired:0};let d=JSON.parse(fs.readFileSync(p));if(d.expired&&Date.now()>d.expired){d={plan:'Gratis',sisaHari:0,expired:0};fs.writeFileSync(p,JSON.stringify(d))}if(d.expired)d.sisaHari=Math.ceil((d.expired-Date.now())/(86400000));return d}
function getAntiPromo(userId){const p=getAntiPromoPath(userId);if(!fs.existsSync(p))return{...DEFAULT_ANTI_PROMO};try{return normalizeAntiPromo(JSON.parse(fs.readFileSync(p,'utf8')))}catch{return{...DEFAULT_ANTI_PROMO}}}
function saveAntiPromo(userId,value){const settings=normalizeAntiPromo(value);fs.writeFileSync(getAntiPromoPath(userId),JSON.stringify(settings,null,2));return settings}
const DEFAULT_BOT_SETTINGS={welcomeEnabled:false,welcomeDelete:false,welcomeDeleteAfter:10,welcomeText:'Selamat datang, {@username}!',leaveEnabled:false,leaveText:'Sampai jumpa, {@username}.',commandsEnabled:true,startBotText:'Bot aktif dan siap digunakan.',jadibotEnabled:true,botToken:'',whitelistUser:false,whitelistNumbers:[],authorizedNumbers:[],scheduleEnabled:false,scheduleStart:'00:00',scheduleEnd:'00:00',newsEnabled:false,newsGroups:[],newsKeywords:['viral','breaking','terkini','heboh','hype'],allowInvite:false,allowKick:false,botProviderDeviceId:'device-1'};
function normalizeBotSettings(value={}){const number=Number(value.welcomeDeleteAfter),normalizeNumbers=items=>Array.isArray(items)?[...new Set(items.map(item=>String(item).replace(/\D/g,'')).filter(item=>item.length>=8&&item.length<=15))].slice(0,500):[],normalizeTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))?String(value):'00:00',provider=String(value.botProviderDeviceId||'device-1');return{welcomeEnabled:value.welcomeEnabled===true,welcomeDelete:value.welcomeDelete===true,welcomeDeleteAfter:Number.isFinite(number)?Math.min(3600,Math.max(1,Math.round(number))):10,welcomeText:typeof value.welcomeText==='string'&&value.welcomeText.trim()?value.welcomeText.trim().slice(0,1000):DEFAULT_BOT_SETTINGS.welcomeText,leaveEnabled:value.leaveEnabled===true,leaveText:typeof value.leaveText==='string'&&value.leaveText.trim()?value.leaveText.trim().slice(0,1000):DEFAULT_BOT_SETTINGS.leaveText,commandsEnabled:value.commandsEnabled!==false,startBotText:typeof value.startBotText==='string'&&value.startBotText.trim()?value.startBotText.trim().slice(0,1000):DEFAULT_BOT_SETTINGS.startBotText,jadibotEnabled:value.jadibotEnabled!==false,botToken:typeof value.botToken==='string'?value.botToken.slice(0,120):'',whitelistUser:value.whitelistUser===true,whitelistNumbers:normalizeNumbers(value.whitelistNumbers),authorizedNumbers:normalizeNumbers(value.authorizedNumbers),scheduleEnabled:value.scheduleEnabled===true,scheduleStart:normalizeTime(value.scheduleStart),scheduleEnd:normalizeTime(value.scheduleEnd),newsEnabled:value.newsEnabled===true,newsGroups:Array.isArray(value.newsGroups)?[...new Set(value.newsGroups.map(item=>String(item)).filter(item=>item.endsWith('@g.us')))].slice(0,100):[],newsKeywords:Array.isArray(value.newsKeywords)?[...new Set(value.newsKeywords.map(item=>String(item).trim().toLowerCase()).filter(Boolean))].slice(0,50):DEFAULT_BOT_SETTINGS.newsKeywords,allowInvite:value.allowInvite===true,allowKick:value.allowKick===true,botProviderDeviceId:/^[A-Za-z0-9_-]{1,40}$/.test(provider)?provider:'device-1'}}
function getBotSettings(userId){return normalizeBotSettings(readJson(getBotSettingsPath(userId),DEFAULT_BOT_SETTINGS))}
function saveBotSettings(userId,value){const settings=normalizeBotSettings({...getBotSettings(userId),...value,botToken:value.botToken||getBotSettings(userId).botToken});writeJson(getBotSettingsPath(userId),settings);return settings}
function replaceBotVariables(text,participant){return String(text||'').replaceAll('{@username}',mentionText(participant?.id||participant?.jid||participant||''))}
function getWhatsAppNumber(value){return String(value||'').split('@')[0].split(':')[0].replace(/\D/g,'')}
function isBotUserAllowed(sender,settings,sock){if(!settings.whitelistUser)return false;const number=getWhatsAppNumber(sender),ownerNumber=getWhatsAppNumber(sock?.user?.id);return number===ownerNumber||settings.whitelistNumbers.includes(number)||settings.authorizedNumbers.includes(number)}
function getAvailableCredit(userId){const limit=(LIMITS[getUserBilling(userId).plan]||LIMITS.Gratis).api;if(limit===-1)return'Unlimited';const usage=readJson(getUsagePath(userId),{}),used=usage.month===new Date().getMonth()?Number(usage.api||0):0;return String(Math.max(0,limit-used))}
function botScheduleActive(settings){if(!settings.scheduleEnabled)return true;const current=new Date().toTimeString().slice(0,5),start=settings.scheduleStart,end=settings.scheduleEnd;if(start===end)return true;return start<end?current>=start&&current<end:current>=start||current<end}
function whatsappAccountPanel(userId){const profile=getUserProfile(userId),connected=getConnectedNumber(userId);return`Account Panel\n\nRegistered: Yes\nLogin as: ${profile.email||profile.displayName||'-'}${profile.provider==='github'?' / @github.com':profile.provider==='google'?' / @google.com':''}\nRegistered Phone Number: ${connected?`+${getWhatsAppNumber(connected)}`:'Belum terhubung'}\nAvailable Credit: ${getAvailableCredit(userId)}\nToken Tersedia Buat bot Jawab: ${getBotSettings(userId).botToken?'Ya':'Belum dibuat'}`}
function getUserProfile(userId){return readJson(`./data/profile_${userId}.json`,{email:null,provider:'akun',displayName:String(userId)})}
function getConnectedNumber(userId){const sock=getUserSocket(userId);return sock?.user?.id?.split(':')[0]||null}
function checkLimit(userId,type){const b=getUserBilling(userId),limit=(LIMITS[b.plan]||LIMITS.Gratis)[type];if(limit===-1)return{allowed:true};const p=getUsagePath(userId);let u=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{autoReply:0,api:0,date:new Date().toDateString(),month:new Date().getMonth()};if(u.date!==new Date().toDateString()){u.autoReply=0;u.date=new Date().toDateString()}if(u.month!==new Date().getMonth()){u.api=0;u.month=new Date().getMonth()}if(type==='autoReply'&&u.autoReply>=limit)return{allowed:false,reason:`Limit auto reply harian ${limit} habis. Upgrade ke Junior`};if(type==='api'&&u.api>=limit)return{allowed:false,reason:`Limit API bulanan ${limit} habis. Upgrade ke Junior`};return{allowed:true,usage:u}}
function addUsage(userId,type){const p=getUsagePath(userId);let u=fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):{autoReply:0,api:0,date:new Date().toDateString(),month:new Date().getMonth()};if(u.date!==new Date().toDateString()){u.autoReply=0;u.date=new Date().toDateString()}if(u.month!==new Date().getMonth()){u.api=0;u.month=new Date().getMonth()}u[type]=(u[type]||0)+1;fs.writeFileSync(p,JSON.stringify(u))}
function recordApiStat(userId,result){const p=getStatsPath(userId),stats=readJson(p,{apiCalls:0,sent:0,failed:0});stats.apiCalls++;if(result==='sent')stats.sent++;if(result==='failed')stats.failed++;stats.updatedAt=Date.now();writeJson(p,stats);return stats}
function getAccountStats(userId){const stats=readJson(getStatsPath(userId),{apiCalls:0,sent:0,failed:0}),total=stats.sent+stats.failed;return{...stats,totalSent:stats.sent,totalAttempts:total,successRate:total?Number((stats.sent/total*100).toFixed(2)):0,failedRate:total?Number((stats.failed/total*100).toFixed(2)):0}}
function sanitizeNumber(number){if(!number)return{valid:false,reason:'Nomor tidak boleh kosong'};const clean=number.toString().replace(/\D/g,'');if(clean.length<8||clean.length>15)return{valid:false,reason:'Panjang nomor tidak valid'};return{valid:true,number:clean}}

function generateApiKey(){return'wa_'+crypto.randomBytes(32).toString('hex')}
function checkApiKey(req,res,next){const ip=getClientIP(req),apiKey=req.headers['x-api-key'];if(!apiKey){recordViolation(ip);return res.status(401).json({success:false,error:'API Key tidak ditemukan'})}let ownerId=null;let files=[];try{files=fs.readdirSync('./data')}catch{}for(const file of files){if(!file.startsWith('apikeys_')||!file.endsWith('.json'))continue;try{const keys=JSON.parse(fs.readFileSync(`./data/${file}`,'utf8'));if(Array.isArray(keys)&&keys.includes(apiKey)){ownerId=file.slice('apikeys_'.length,-'.json'.length);break}}catch{}}if(!ownerId){recordViolation(ip);return res.status(403).json({success:false,error:'API Key tidak valid'})}req.apiUserId=ownerId;req.authType='api-key';next()}

function generateServerToken(){return'srv_'+crypto.randomBytes(32).toString('hex')}
function getServerTokens(){try{const d=JSON.parse(fs.readFileSync(SERVER_TOKENS_FILE,'utf8'));return Array.isArray(d)?d:[]}catch{return[]}}
function saveServerTokens(t){fs.writeFileSync(SERVER_TOKENS_FILE,JSON.stringify(t,null,2))}
function checkAuthToken(req,res,next){const ip=getClientIP(req),auth=req.headers.authorization;if(!auth){recordViolation(ip);return res.status(401).json({success:false,error:'Token tidak ditemukan'})}const token=auth.replace(/^Bearer\s+/i,'').trim(),found=getServerTokens().find(x=>typeof x==='string'?x===token:x?.token===token);if(!found){recordViolation(ip);return res.status(403).json({success:false,error:'Token tidak valid'})}if(typeof found==='object')req.apiUserId=found.userId;req.authType='server-token';if(!req.apiUserId)return res.status(503).json({success:false,error:'Server Token belum memiliki userId'});next()}
function apiAuthentication(req,res,next){if(req.headers['x-api-key'])return checkApiKey(req,res,next);if(req.headers.authorization)return checkAuthToken(req,res,next);recordViolation(getClientIP(req));res.status(401).json({success:false,error:'Butuh X-API-Key atau Authorization Bearer Token'})}

app.set('trust proxy',1);
app.use(checkIPBan);
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,'public')));
app.use(session({secret:process.env.SESSION_SECRET||'change-this-secret',resave:false,saveUninitialized:false,cookie:{secure:false,sameSite:'lax',maxAge:7*86400000}}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({clientID:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,callbackURL:process.env.CALLBACK_URL},(a,r,p,cb)=>cb(null,p)));
passport.use(new GitHubStrategy({clientID:process.env.GITHUB_CLIENT_ID,clientSecret:process.env.GITHUB_CLIENT_SECRET,callbackURL:process.env.GITHUB_CALLBACK_URL},(a,r,p,cb)=>cb(null,p)));
passport.serializeUser((u,d)=>d(null,u));
passport.deserializeUser((u,d)=>d(null,u));

const isLoggedIn=(req,res,next)=>req.user?next():res.redirect('/login');
const checkAdminCode=(req,res,next)=>req.session.isAdmin?next():res.status(403).json({error:'Akses ditolak. Masukkan kode admin'});

app.get('/login',(req,res)=>res.sendFile(path.join(__dirname,'public/login.html')));
app.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
function oauthCallback(provider,strategy){return(req,res,next)=>passport.authenticate(strategy,(error,user)=>{if(error||!user){console.error(`[OAUTH ${provider.toUpperCase()}]`,error?.message||'OAuth gagal',error?.statusCode||'');return res.redirect(`/login?oauth_error=${provider}`)}req.logIn(user,loginError=>{if(loginError)return next(loginError);res.redirect('/dashboard')})})(req,res,next)}
app.get('/auth/google/callback',oauthCallback('google','google'));
app.get('/auth/github',passport.authenticate('github',{scope:['user:email']}));
app.get('/auth/github/callback',oauthCallback('github','github'));
app.get('/ref/:code',(req,res)=>{req.session.referralCode=String(req.params.code).slice(0,80);res.redirect('/login')});
app.get('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

app.get('/api/user',isLoggedIn,(req,res)=>{ensureTrial(req.user);userEmails[req.user.id]=req.user.email||req.user._json?.email||null;writeJson(`./data/profile_${req.user.id}.json`,{email:userEmails[req.user.id],provider:req.user.provider||req.user._json?.provider||'akun',displayName:req.user.displayName||req.user.username||String(req.user.id)});const affiliates=readJson(AFFILIATE_FILE,[]);if(!affiliates.some(item=>item.userId===req.user.id)){affiliates.push({userId:req.user.id,referralCode:`${req.user.id}-${crypto.randomBytes(4).toString('hex')}`,referredBy:req.session.referralCode||null,commission:0,referrals:[]});writeJson(AFFILIATE_FILE,affiliates)}res.json({user:req.user})});
app.get('/api/info',isLoggedIn,(req,res)=>{const b=getUserBilling(req.user.id);res.json({version:VERSION,changelog:CHANGELOG,user:req.user,plan:b.plan,sisaHari:b.sisaHari,expired:b.expired,trial:Boolean(b.trial),baseUrl:BASE_URL,features:['analytics','csv-export','xlsx-export','affiliate','free-trial','coupons','auto-reconnect','disconnect-email-alerts','quick-templates','dark-mode','batch-api']})});
app.get('/api/country-preference',(req,res)=>res.json({countryCode:getPreferredCountryCode(req)}));
app.post('/api/verify-admin',isLoggedIn,(req,res)=>{if(req.body.code===ADMIN_CODE){req.session.isAdmin=true;return res.json({success:true})}res.status(403).json({success:false,error:'Kode salah'})});
app.get('/api/data/:tab',isLoggedIn,(req,res)=>{const userId=req.user.id,p=getUserDataPath(userId);if(!fs.existsSync(p))fs.writeFileSync(p,'[]');const replies=JSON.parse(fs.readFileSync(p,'utf8')),op=`./data/orders_${userId}.json`,orders=fs.existsSync(op)?JSON.parse(fs.readFileSync(op,'utf8')):[];res.json({countries,replies,orders,antiPromo:getAntiPromo(userId),botSettings:getBotSettings(userId),user:req.user,baseUrl:BASE_URL})});
app.get('/api/analytics',isLoggedIn,(req,res)=>{const analytics=getAnalytics(req.user.id),times=analytics.responseTimes.map(row=>row.ms);res.json({success:true,keywords:Object.entries(analytics.keywords).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([keyword,count])=>({keyword,count})),messages:analytics.messages.length,responseTime:{count:times.length,averageMs:times.length?Math.round(times.reduce((sum,value)=>sum+value,0)/times.length):0,minMs:times.length?Math.min(...times):0,maxMs:times.length?Math.max(...times):0}})});
app.get('/api/export/:type',isLoggedIn,(req,res)=>{const type=['messages','contacts','transactions'].includes(req.params.type)?req.params.type:'messages',rows=exportRows(type,req.user.id),format=req.query.format==='xlsx'?'xlsx':'csv';if(format==='xlsx'){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'Report');const buffer=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').set('Content-Disposition',`attachment; filename="${type}.xlsx"`).send(buffer);return}const headers=[...new Set(rows.flatMap(row=>Object.keys(row||{})))];const csv=[headers.join(','),...rows.map(row=>headers.map(header=>csvValue(row?.[header])).join(','))].join('\n');res.type('text/csv').set('Content-Disposition',`attachment; filename="${type}.csv"`).send(csv)});
app.get('/api/affiliate',isLoggedIn,(req,res)=>{const item=readJson(AFFILIATE_FILE,[]).find(row=>row.userId===req.user.id);res.json({success:true,referralCode:item?.referralCode||null,referralUrl:item?`${BASE_URL}/ref/${item.referralCode}`:null,commission:item?.commission||0,referrals:item?.referrals||[]})});
app.get('/api/account/stats',isLoggedIn,(req,res)=>res.json({success:true,stats:getAccountStats(req.user.id),apiKeys:readJson(getApiKeysPath(req.user.id),[]).map(key=>({key,masked:`${key.slice(0,7)}...${key.slice(-4)}`}))}));
app.get('/api/health',isLoggedIn,(req,res)=>{const userId=req.user.id,billing=getUserBilling(userId),limit=(LIMITS[billing.plan]||LIMITS.Gratis).wa,devices=getDeviceIds(userId),connected=getConnectedDevices(userId);res.json({success:true,server:{status:'ok',uptime:Math.round(process.uptime()),time:new Date().toISOString(),version:VERSION},whatsapp:{status:connected.length?'connected':'disconnected',connectedDevices:connected,storedDevices:devices},account:{plan:billing.plan,deviceUsage:connected.length,deviceLimit:limit,apiConfigured:Boolean(INSTANLIVE_API_KEY)}})});
app.post('/api/admin/coupons',isLoggedIn,checkAdminCode,(req,res)=>{const code=String(req.body.code||'').trim().toUpperCase();const discount=Number(req.body.discount);if(!/^[A-Z0-9_-]{3,40}$/.test(code)||!Number.isFinite(discount)||discount<=0||discount>100)return res.status(400).json({success:false,message:'Kode atau diskon tidak valid'});const coupons=readJson(COUPON_FILE,[]);if(coupons.some(item=>item.code===code))return res.status(409).json({success:false,message:'Kupon sudah ada'});coupons.push({code,discount,active:true,createdAt:Date.now(),uses:0});writeJson(COUPON_FILE,coupons);res.json({success:true,message:'Kupon dibuat'})});
app.get('/api/admin/coupons',isLoggedIn,checkAdminCode,(req,res)=>res.json({success:true,coupons:readJson(COUPON_FILE,[])}));
app.post('/api/coupon/validate',isLoggedIn,(req,res)=>{const coupon=readJson(COUPON_FILE,[]).find(item=>item.code===String(req.body.code||'').trim().toUpperCase()&&item.active);if(!coupon)return res.status(404).json({success:false,message:'Kupon tidak ditemukan atau tidak aktif'});res.json({success:true,code:coupon.code,discount:coupon.discount})});
app.post('/api/save-replies',isLoggedIn,(req,res)=>{fs.writeFileSync(getUserDataPath(req.user.id),JSON.stringify(req.body.replies||[],null,2));res.json({success:true,message:'Data berhasil disimpan'})});
app.post('/api/save-anti-promo',isLoggedIn,(req,res)=>{const settings=saveAntiPromo(req.user.id,req.body);res.json({success:true,settings,message:'Pengaturan anti-promosi disimpan'})});
app.post('/api/save-bot-settings',isLoggedIn,(req,res)=>{const settings=saveBotSettings(req.user.id,req.body);res.json({success:true,settings,message:'Pengaturan Bot WhatsApp disimpan'})});
app.post('/api/generate-bot-token',isLoggedIn,(req,res)=>{const settings=getBotSettings(req.user.id);settings.botToken=`bot_${crypto.randomBytes(24).toString('hex')}`;saveBotSettings(req.user.id,settings);res.json({success:true,token:settings.botToken,settings,message:'Token bot berhasil dibuat'})});
app.get('/api/whatsapp-groups',isLoggedIn,(req,res)=>{const settings=getBotSettings(req.user.id),entry=Object.entries(socketInfo).find(([sessionKey,info])=>info.userId===req.user.id&&info.deviceId===settings.botProviderDeviceId&&socks[sessionKey]?.user);if(!entry)return res.json({success:true,groups:[]});socks[entry[0]].groupFetchAllParticipating().then(data=>res.json({success:true,groups:Object.entries(data||{}).map(([id,group])=>({id,name:group.subject||id}))})).catch(()=>res.json({success:true,groups:[]}))});
app.get('/api/whatsapp-devices',isLoggedIn,(req,res)=>res.json({success:true,devices:Object.entries(socketInfo).filter(([sessionKey,info])=>info.userId===req.user.id&&socks[sessionKey]?.user).map(([sessionKey,info])=>({deviceId:info.deviceId,number:socks[sessionKey].user.id.split(':')[0]}))}));
app.get('/api/system-bot-provider',isLoggedIn,(req,res)=>{const providers=[{phone:SYSTEM_BOT_PHONE,name:SYSTEM_BOT_NAME},{phone:SYSTEM_BOT_PHONE_2,name:SYSTEM_BOT_NAME_2}].map(provider=>{const entry=Object.entries(socks).find(([,sock])=>getWhatsAppNumber(sock?.user?.id)===provider.phone);return{...provider,image:SYSTEM_BOT_IMAGE,verified:true,connected:Boolean(entry),jid:entry?`${provider.phone}@s.whatsapp.net`:null}});res.json({success:true,providers})});
app.post('/api/system-bot/add-to-group',isLoggedIn,async(req,res)=>{const groupId=String(req.body.groupId||''),systemBotPhone=String(req.body.systemBotPhone||SYSTEM_BOT_PHONE);if(!/^\d+-\d+@g\.us$/.test(groupId))return res.status(400).json({success:false,message:'Grup WhatsApp tidak valid'});const settings=getBotSettings(req.user.id),ownerEntry=Object.entries(socketInfo).find(([sessionKey,info])=>info.userId===req.user.id&&info.deviceId===settings.botProviderDeviceId&&socks[sessionKey]?.user),systemEntry=Object.entries(socks).find(([,sock])=>[SYSTEM_BOT_PHONE,SYSTEM_BOT_PHONE_2].includes(getWhatsAppNumber(sock?.user?.id))&&getWhatsAppNumber(sock?.user?.id)===systemBotPhone);if(!ownerEntry)return res.status(409).json({success:false,message:'Provider akun Anda belum terhubung'});if(!systemEntry)return res.status(503).json({success:false,message:'Provider bot sistem belum online'});try{const inviteCode=await socks[ownerEntry[0]].groupInviteCode(groupId);await socks[systemEntry[0]].groupAcceptInvite(inviteCode);res.json({success:true,message:'Provider bot sistem berhasil ditambahkan ke grup'})}catch(error){res.status(500).json({success:false,message:`Gagal menambahkan provider: ${error.message}`})}});
app.get('/api/admin/banned-ips',isLoggedIn,checkAdminCode,(req,res)=>res.json({ips:[...bannedIPs]}));
app.delete('/api/admin/unban-ip',isLoggedIn,checkAdminCode,(req,res)=>{const{ip}=req.body;bannedIPs.delete(ip);ipViolations.delete(ip);saveBannedIPs();saveViolations();res.json({success:true,message:`IP ${ip} berhasil dibuka`})});
app.post('/api/generate-key',isLoggedIn,(req,res)=>{const userId=req.user.id,p=getApiKeysPath(userId);let keys=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[],apiKey=generateApiKey();keys.push(apiKey);fs.writeFileSync(p,JSON.stringify(keys,null,2));res.json({success:true,apiKey,endpoint:`${BASE_URL}/v1/send-message`})});
app.get('/api/my-keys',isLoggedIn,(req,res)=>{const p=getApiKeysPath(req.user.id),keys=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[];res.json({keys})});
app.delete('/api/delete-key',isLoggedIn,(req,res)=>{const p=getApiKeysPath(req.user.id);let keys=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):[];keys=keys.filter(k=>k!==req.body.key);fs.writeFileSync(p,JSON.stringify(keys,null,2));res.json({success:true,message:'API Key berhasil dihapus'})});
app.post('/api/generate-server-token',isLoggedIn,(req,res)=>{const tokens=getServerTokens(),token=generateServerToken();tokens.push({token,userId:req.user.id,createdAt:Date.now()});saveServerTokens(tokens);res.json({success:true,token})});
app.get('/api/my-server-tokens',isLoggedIn,(req,res)=>res.json({tokens:getServerTokens().filter(x=>typeof x==='object'&&x.userId===req.user.id)}));
app.delete('/api/delete-server-token',isLoggedIn,(req,res)=>{const token=req.body.token;saveServerTokens(getServerTokens().filter(x=>typeof x==='string'?x!==token:!(x.token===token&&x.userId===req.user.id)));res.json({success:true,message:'Server Token berhasil dihapus'})});
app.get('/api/billing/payment-methods',isLoggedIn,(req,res)=>res.json({success:true,provider:'instanlive',methods:[{group:'Xendit Checkout',items:[{code:'xendit',name:'Bayar dengan Xendit',logo:'https://cdn-icons-png.flaticon.com/512/2830/2830284.png'}]},{group:'QRIS',items:AUSTIN_METHODS.map(([code,name,logo])=>({code,name,logo}))}]}));
app.get('/api/billing/pricing',isLoggedIn,(req,res)=>{const pricing=getRegionalPricing(req.query.countryCode||'62');res.json({success:true,base:{junior:50000,senior:150000,currency:'IDR'},pricing})});

app.post('/api/billing/create-qris',isLoggedIn,async(req,res)=>{
  try{
    console.log('[BILLING] Create InstanLive deposit for:', req.user.id);
    if(!INSTANLIVE_API_KEY)return res.status(500).json({success:false,message:'API Key InstanLive belum diisi di .env'});
    const{plan,amount}=req.body,numericAmount=Number(amount);
    if(!plan||!Number.isInteger(numericAmount)||numericAmount<=0)return res.status(400).json({success:false,message:'plan dan amount wajib diisi'});

    const order_id=`ICODE-${req.user.id}-${Date.now()}`;
    const couponCode=String(req.body.coupon||'').trim().toUpperCase(),coupon=couponCode?readJson(COUPON_FILE,[]).find(item=>item.code===couponCode&&item.active):null;
    const discount=coupon?Math.min(numericAmount,Math.round(numericAmount*coupon.discount/100)):0,chargedAmount=numericAmount-discount;
    const bodyObj={ref_id:order_id,amount:Math.max(100,chargedAmount),callback_url:INSTANLIVE_CALLBACK_URL},body=JSON.stringify(bodyObj);
    const response=await axios.post(INSTANLIVE_DEPOSIT_URL,body,{headers:getInstanliveHeaders(),timeout:15000,validateStatus:()=>true});
    console.log('[INSTANLIVE] STATUS:', response.status, response.data);
    const data=response.data;
    if(response.status<200||response.status>=300||(data?.success!==true&&data?.ok!==true))return res.status(response.status>=400?response.status:400).json({success:false,message:data?.message||data?.error||'Gagal membuat deposit InstanLive'});
    const deposit=data.data||data.deposit||data,transactionId=deposit.transaction_id||deposit.txn_id||deposit.id,qrValue=deposit.qr_string||deposit.qr_image||deposit.qris_string||deposit.qr;
    if(!transactionId||!qrValue)return res.status(502).json({success:false,message:'transaction_id atau QRIS tidak ditemukan',providerFields:Object.keys(deposit||{})});
    const qrImage=/^(data:image\/|https?:\/\/)/i.test(String(qrValue))?String(qrValue):await qrcode.toDataURL(String(qrValue),{errorCorrectionLevel:'M',margin:2,width:512});

    if(coupon){coupon.uses=(coupon.uses||0)+1;writeJson(COUPON_FILE,readJson(COUPON_FILE,[]).map(item=>item.code===coupon.code?coupon:item))}
    fs.writeFileSync(`./data/pending_${order_id}.json`,JSON.stringify({userId:req.user.id,plan,amount:chargedAmount,originalAmount:numericAmount,coupon:coupon?.code||null,order_id,transactionId,time:Date.now(),expired_at:deposit.expired_at||null},null,2));
    res.json({success:true,provider:'instanlive',qr_url:qrImage,qr_image:qrImage,payment_url:deposit.payment_url||null,transaction_id:transactionId,order_id,ref_id:order_id})
  }catch(e){
    console.error('[INSTANLIVE ERROR]', e.response?.data || e.message);
    res.status(e.response?.status||500).json({success:false,message:e.response?.data?.message||e.message||'Gagal konek ke InstanLive'})
  }
});

app.post('/api/billing/create-xendit-invoice',isLoggedIn,async(req,res)=>{
  try{
    if(!XENDIT_SECRET_KEY)return res.status(503).json({success:false,message:'XENDIT_SECRET_KEY belum dikonfigurasi di .env'});
    const{plan,amount}=req.body,numericAmount=Number(amount);
    const expectedAmount=plan==='Junior'?50000:plan==='Senior'?150000:0;
    if(!expectedAmount||numericAmount!==expectedAmount)return res.status(400).json({success:false,message:'Paket dan jumlah pembayaran tidak valid'});
    const order_id=`ICODE-${req.user.id}-${Date.now()}`;
    const couponCode=String(req.body.coupon||'').trim().toUpperCase(),coupon=couponCode?readJson(COUPON_FILE,[]).find(item=>item.code===couponCode&&item.active):null;
    const discount=coupon?Math.min(numericAmount,Math.round(numericAmount*coupon.discount/100)):0,chargedAmount=numericAmount-discount;
    const response=await axios.post(XENDIT_INVOICE_URL,{external_id:order_id,amount:chargedAmount,currency:'IDR',description:`Paket ${plan} iCodeAutoResponder`,invoice_duration:86400,success_redirect_url:`${BASE_URL}/dashboard?payment=success`,failure_redirect_url:`${BASE_URL}/dashboard?payment=failed`},{headers:getXenditHeaders(),timeout:15000,validateStatus:()=>true});
    const invoice=response.data;
    if(response.status<200||response.status>=300||!invoice?.id||!invoice?.invoice_url)return res.status(response.status>=400?response.status:502).json({success:false,message:invoice?.message||'Xendit gagal membuat invoice'});
    if(coupon){coupon.uses=(coupon.uses||0)+1;writeJson(COUPON_FILE,readJson(COUPON_FILE,[]).map(item=>item.code===coupon.code?coupon:item))}
    writeJson(`./data/pending_${order_id}.json`,{userId:req.user.id,plan,amount:chargedAmount,originalAmount:numericAmount,coupon:coupon?.code||null,order_id,transactionId:invoice.id,provider:'xendit',time:Date.now(),expired_at:invoice.expiry_date||null});
    res.json({success:true,provider:'xendit',payment_url:invoice.invoice_url,transaction_id:invoice.id,order_id,amount:chargedAmount});
  }catch(error){
    console.error('[XENDIT ERROR]',error.response?.data||error.message);
    res.status(error.response?.status||500).json({success:false,message:error.response?.data?.message||'Gagal membuat invoice Xendit'});
  }
});

app.post('/api/billing/callback-instanlive',async(req,res)=>{try{const payload=req.body||{},transactionId=payload.data?.txn_id||payload.data?.transaction_id||payload.txn_id||payload.transaction_id;if(!transactionId)return res.status(400).json({success:false,message:'txn_id tidak ditemukan'});await settleAustinDeposit(transactionId);res.json({success:true})}catch(error){res.status(400).json({success:false,message:'Callback InstanLive tidak valid'})}});
app.post('/api/billing/callback-xendit',async(req,res)=>{try{const provided=String(req.headers['x-callback-token']||''),expected=String(XENDIT_CALLBACK_TOKEN||'');if(!expected||provided.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return res.status(401).json({success:false,message:'Callback token tidak valid'});const invoice=req.body||{};if(invoice.status==='PAID'){const files=fs.readdirSync('./data').filter(file=>file.startsWith('pending_')&&file.endsWith('.json')),entry=files.find(file=>{const pending=readJson(`./data/${file}`,{});return pending.provider==='xendit'&&pending.transactionId===invoice.id});if(entry){const pending=readJson(`./data/${entry}`,{});if(Number(invoice.paid_amount??invoice.amount)!==Number(pending.amount))return res.status(400).json({success:false,message:'Jumlah pembayaran tidak cocok'});await settleAustinDeposit(invoice.id)}}res.json({success:true})}catch(error){console.error('[XENDIT CALLBACK]',error.message);res.status(400).json({success:false,message:'Callback Xendit tidak valid'})}});
async function settleAustinDeposit(transactionId){const files=fs.readdirSync('./data').filter(file=>file.startsWith('pending_')&&file.endsWith('.json')),entry=files.find(file=>readJson(`./data/${file}`,{}).transactionId===transactionId);if(!entry)return false;const p=`./data/${entry}`,pending=readJson(p,{}),expired=Date.now()+30*86400000;writeJson(getBillingPath(pending.userId),{plan:pending.plan,sisaHari:30,expired,trial:false});applyAffiliateCommission(pending.userId,pending.amount);fs.unlinkSync(p);return true}
app.post('/api/billing/callback-austin',express.raw({type:'application/json'}),async(req,res)=>{try{const rawBody=Buffer.isBuffer(req.body)?req.body:Buffer.from(req.body||''),signature=req.headers['x-austinpay-signature'];if(!signature||!AUSTIN_WEBHOOK_SECRET)return res.status(401).json({success:false,message:'Webhook signature tidak ditemukan'});const expected=crypto.createHmac('sha256',AUSTIN_WEBHOOK_SECRET).update(rawBody).digest('hex'),provided=String(signature);if(provided.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return res.status(401).json({success:false,message:'Invalid signature'});const payload=JSON.parse(rawBody.toString());if(payload.event!=='deposit.paid')return res.json({success:true,ignored:true});const transactionId=payload.data?.transactionId||payload.data?.transaction_id;if(!transactionId)return res.status(400).json({success:false,message:'transactionId tidak ditemukan'});await settleAustinDeposit(transactionId);res.json({success:true})}catch(error){res.status(400).json({success:false,message:'Webhook Austin tidak valid'})}});
app.get('/api/billing/check/:order_id',isLoggedIn,async(req,res,next)=>{const pending=readJson(`./data/pending_${req.params.order_id}.json`,null);if(pending?.provider!=='xendit')return next();if(pending.userId!==req.user.id)return res.json({status:'NOT_FOUND'});if(!XENDIT_SECRET_KEY)return res.json({status:'PENDING'});try{const response=await axios.get(`${XENDIT_INVOICE_URL}/${encodeURIComponent(pending.transactionId)}`,{headers:getXenditHeaders(),timeout:10000,validateStatus:()=>true});if(response.status>=400)return res.json({status:'PENDING'});const invoice=response.data;if(invoice.status==='PAID'){if(invoice.external_id!==pending.order_id||Number(invoice.paid_amount??invoice.amount)!==Number(pending.amount))return res.json({status:'PENDING'});await settleAustinDeposit(pending.transactionId);return res.json({status:'PAID'})}if(invoice.status==='EXPIRED')return res.json({status:'EXPIRED'});res.json({status:'PENDING',providerStatus:invoice.status||'PENDING'})}catch{return res.json({status:'PENDING'})}});
app.get('/api/billing/check/:order_id',isLoggedIn,async(req,res)=>{const{order_id}=req.params,p=`./data/pending_${order_id}.json`;if(!fs.existsSync(p))return res.json({status:'NOT_FOUND'});try{if(!AUSTIN_API_KEY||!AUSTIN_API_SECRET)return res.json({status:'PENDING'});const pending=readJson(p,{}),transactionId=pending.transactionId,pathname=`/api/v1/deposit/check/${encodeURIComponent(transactionId)}`,response=await axios.get(`${AUSTIN_API_BASE_URL}/deposit/check/${encodeURIComponent(transactionId)}`,{headers:getAustinHeaders('GET',pathname,''),timeout:10000,validateStatus:()=>true}),data=response.data;if(response.status>=400)return res.json({status:'PENDING'});if(data?.success===true&&data.status==='paid'){await settleAustinDeposit(transactionId);return res.json({status:'PAID'})}if(data?.status==='expired')return res.json({status:'EXPIRED'});res.json({status:'PENDING',providerStatus:data?.status||'pending'})}catch{res.json({status:'PENDING'})}});

async function handleSendMessage(req,res){const userId=req.apiUserId;if(!userId)return res.status(401).json({success:false,error:'User API tidak ditemukan'});recordApiStat(userId,'attempt');const limit=checkLimit(userId,'api');if(!limit.allowed)return res.status(429).json({success:false,error:limit.reason});const sock=getUserSocket(userId,req.body.deviceId);let{number,message}=req.body;const v=sanitizeNumber(number);if(!v.valid){recordApiStat(userId,'failed');return res.status(400).json({success:false,error:v.reason})}number=v.number;if(!message||typeof message!=='string'||message.length>4096){recordApiStat(userId,'failed');return res.status(400).json({success:false,error:'Pesan tidak valid'})}if(!sock?.user){recordApiStat(userId,'failed');return res.status(503).json({success:false,error:'WhatsApp belum terhubung untuk API Key ini',userId,requestedDevice:req.body.deviceId||'auto',connectedDevices:getConnectedDevices(userId),hint:'Pastikan API Key dibuat pada akun yang sama dengan sesi WhatsApp dan gunakan deviceId dari GET /v1/status'})}try{const start=Date.now();await sock.sendMessage(`${number}@s.whatsapp.net`,{text:message});recordApiStat(userId,'sent');addUsage(userId,'api');res.json({success:true,message:'Pesan terkirim',number,deviceId:req.body.deviceId||'default',userId,authType:req.authType,ping:`${Date.now()-start}ms`})}catch(e){recordApiStat(userId,'failed');res.status(500).json({success:false,error:'Gagal mengirim: '+e.message})}}
async function handleBatchSendMessage(req,res){const messages=Array.isArray(req.body.messages)?req.body.messages:[];if(!messages.length||messages.length>100)return res.status(400).json({success:false,error:'messages harus berisi 1-100 item'});const results=[];for(const item of messages){const fakeRes={statusCode:200,status(code){this.statusCode=code;return this},json(data){results.push(data);return this}};await handleSendMessage({apiUserId:req.apiUserId,authType:req.authType,body:item},fakeRes)}res.status(200).json({success:results.every(row=>row.success),count:results.length,results})}
app.get('/v1',(req,res)=>res.json({success:true,name:'iCodeAutoResponder API',version:'1.0.0',baseUrl:BASE_URL,endpoints:{status:'GET /v1/status',sendMessage:'POST /v1/send-message',sendBatch:'POST /v1/send-batch',analytics:'GET /v1/analytics',export:'GET /v1/export/messages'}}));
app.get('/v1/docs',(req,res)=>res.json({success:true,authentication:{header:'x-api-key',example:'wa_xxx'},examples:{sendMessage:{request:{number:'628123456789',message:'Halo dari API'},response:{success:true,message:'Pesan terkirim',number:'628123456789',userId:'user-id',authType:'api-key',ping:'120ms'}},sendBatch:{request:{messages:[{number:'628123456789',message:'Pesan pertama'}]},response:{success:true,count:1,results:[{success:true,message:'Pesan terkirim'}]}},analytics:{response:{success:true,keywords:[['promo',12]],messages:120,averageResponseMs:850}}}}));
app.get('/v1/status',apiAuthentication,(req,res)=>res.json({success:true,authenticated:true,userId:req.apiUserId,authType:req.authType,whatsapp:Boolean(getUserSocket(req.apiUserId,req.query.deviceId)?.user),devices:getDeviceIds(req.apiUserId).map(deviceId=>({deviceId,connected:Boolean(socks[deviceKey(req.apiUserId,deviceId)]?.user)})),connectedDevices:getConnectedDevices(req.apiUserId)}));
app.post('/v1/send-message',apiAuthentication,handleSendMessage);
app.post('/v1/send-batch',apiAuthentication,handleBatchSendMessage);
app.get('/v1/analytics',apiAuthentication,(req,res)=>{const analytics=getAnalytics(req.apiUserId),times=analytics.responseTimes.map(row=>row.ms);res.json({success:true,keywords:Object.entries(analytics.keywords).sort((a,b)=>b[1]-a[1]).slice(0,20),messages:analytics.messages.length,averageResponseMs:times.length?Math.round(times.reduce((sum,value)=>sum+value,0)/times.length):0})});
app.get('/v1/export/:type',apiAuthentication,(req,res)=>{const type=['messages','contacts','transactions'].includes(req.params.type)?req.params.type:'messages',rows=exportRows(type,req.apiUserId),headers=[...new Set(rows.flatMap(row=>Object.keys(row||{})))],csv=[headers.join(','),...rows.map(row=>headers.map(header=>csvValue(row?.[header])).join(','))].join('\n');res.type('text/csv').set('Content-Disposition',`attachment; filename="${type}.csv"`).send(csv)});
app.post('/api/send-message',apiAuthentication,handleSendMessage);
app.post('/api/bug-report',isLoggedIn,(req,res)=>{const{subject,message}=req.body;fs.appendFileSync('./data/bugs.log',`[${new Date().toLocaleString('id-ID')}] User: ${req.user.displayName} | Judul: ${subject} | Pesan: ${message}\n`);res.json({success:true,message:'Laporan terkirim'})});
app.get('/api/status',isLoggedIn,(req,res)=>{const userId=req.user.id,requested=safeDeviceId(req.query.deviceId),key=deviceKey(userId,requested),sock=socks[key];let status='Terputus',dotColor='red',country='Belum terhubung';if(sock?.user){status='Terhubung: '+sock.user.id.split(':')[0];dotColor='green';const n=sock.user.id.split(':')[0];country=n.startsWith('62')?'Indonesia':n.startsWith('65')?'Singapura':n.startsWith('60')?'Malaysia':'Luar Negeri'}else if(lastQr[key]||lastCode[key]){status='Menunggu Scan';dotColor='yellow'}res.json({status,dotColor,qr:lastQr[key],code:lastCode[key],country,deviceId:requested,devices:getDeviceIds(userId).map(deviceId=>({deviceId,connected:Boolean(socks[deviceKey(userId,deviceId)]?.user),status:deviceId===requested&&status==='Menunggu Scan'?'Menunggu Scan':socks[deviceKey(userId,deviceId)]?.user?'Terhubung':'Terputus'})),limit:(LIMITS[getUserBilling(userId).plan]||LIMITS.Gratis).wa})});

function sessionExists(userId,deviceId='device-1'){return fs.existsSync(`${getUserSessionPath(userId,deviceId)}/creds.json`)}
function participantIds(participant){if(!participant)return[];if(typeof participant==='string')return[participant];return[participant.id,participant.jid,participant.phoneNumber].filter(Boolean)}
function sameWhatsAppUser(first,second){const firstIds=participantIds(first),secondIds=participantIds(second);return firstIds.some(firstId=>secondIds.some(secondId=>String(firstId)===String(secondId)||String(firstId).split('@')[0].split(':')[0]===String(secondId).split('@')[0].split(':')[0]))}
async function getGroupParticipant(sock,groupJid,participant){try{const metadata=await sock.groupMetadata(groupJid),entry=metadata.participants.find(item=>sameWhatsAppUser(item,participant));return{metadata,entry}}catch(error){console.error('[WA GROUP METADATA]',error.message);return{metadata:null,entry:null}}}
function getMentionedJid(message){return message.extendedTextMessage?.contextInfo?.mentionedJid?.[0]||message.contextInfo?.mentionedJid?.[0]||null}
async function sendWhatsAppMessage(sock,jid,content,context='SEND'){try{return await sock.sendMessage(jid,content)}catch(error){console.error(`[WA ${context}]`,jid,error.message);return null}}
async function startSock(userId,deviceId='device-1'){
  deviceId=safeDeviceId(deviceId);
  const key=deviceKey(userId,deviceId);
  if(socks[key])return socks[key];
  const{state,saveCreds}=await useMultiFileAuthState(getUserSessionPath(userId,deviceId)),{version}=await fetchLatestBaileysVersion(),sock=makeWASocket({version,auth:state,printQRInTerminal:false,logger:pino({level:'silent'}),browser:Browsers.macOS('Chrome'),connectTimeoutMs:60000,defaultQueryTimeoutMs:60000});
  socks[key]=sock;
  socketInfo[key]={userId,deviceId};
  sock.ev.on('creds.update',saveCreds);
  sock.ev.on('connection.update',async update=>{const{connection,lastDisconnect,qr,pairingCode}=update;if(qr)lastQr[key]=await qrcode.toDataURL(qr);if(pairingCode)lastCode[key]=pairingCode;if(connection==='open'){clearTimeout(disconnectTimers[key]);disconnectTimers[key]=null;lastQr[key]=null;lastCode[key]=null;console.log(`[WA] ${userId}/${deviceId} CONNECTED`)}if(connection==='close'){delete socks[key];lastQr[key]=null;lastCode[key]=null;clearTimeout(disconnectTimers[key]);disconnectTimers[key]=setTimeout(()=>sendEmail(userEmails[userId], 'WhatsApp Anda Terputus', `Perangkat ${deviceId} WhatsApp Anda Terputus, Silakan Hubungkan Kembali`),10*60*1000);const code=lastDisconnect?.error?.output?.statusCode;if(code===DisconnectReason.loggedOut)fs.rmSync(getUserSessionPath(userId,deviceId),{recursive:true,force:true});else setTimeout(()=>startSock(userId,deviceId),5000)}});
  sock.ev.on('messages.upsert',async({messages})=>{
    const m=messages[0];
    if(!m?.message||m.key.fromMe)return;
    const from=m.key.remoteJid;
    if(!from)return;
    const receivedAt=Date.now(),imageMessage=m.message.imageMessage,caption=imageMessage?.caption||'',text=m.message.conversation||m.message.extendedTextMessage?.text||caption||'',info=Object.entries(socketInfo).find(([socketKey])=>socks[socketKey]===sock)?.[1],currentUserId=info?.userId;
    if(!currentUserId)return;
    const botSettings=getBotSettings(currentUserId),command=text.trim(),sender=m.key.participant||m.participant||from,senderNumber=getWhatsAppNumber(sender);
    if(info.deviceId!==botSettings.botProviderDeviceId)return;
    if(imageMessage){try{profileImages[senderNumber]=await downloadMediaMessage(m,'buffer',{});if(!command){await sock.sendMessage(from,{text:'Foto diterima. Kirim /set-BotProfile untuk memasangnya sebagai foto profil bot.'});return;}}catch(error){console.error('[WA PROFILE IMAGE]',error.message)}}
    if(/^\/start$/i.test(command)&&!botSettings.botToken){await sock.sendMessage(from,{text:'AuthToken Belum Diisi\nGunakan /set-AuthToken TOKEN ANDA'});return;}
    const isAuthCommand=/^\/set-AuthToken(?:\s+(.+))?$/i.test(command);
    if(!isBotUserAllowed(sender,botSettings,sock)&&!(isAuthCommand&&botSettings.whitelistUser)){if(/^\/(?:start|start-bot|set-AuthToken)\b/i.test(command))await sock.sendMessage(from,{text:'Bot tidak aktif untuk nomor ini. Centang whitelist bot di website terlebih dahulu.'});return;}
    if(/^\/set-OffBot\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/i.test(command)){
      const match=command.match(/^\/set-OffBot\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/i),start=match[1],end=match[2];
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)){await sock.sendMessage(from,{text:'Format salah. Gunakan /set-OffBot 06:00-21:00'});return;}
      saveBotSettings(currentUserId,{...botSettings,scheduleEnabled:true,scheduleStart:start,scheduleEnd:end});await sock.sendMessage(from,{text:`Jadwal bot disimpan: aktif ${start}-${end}. Gunakan /set-OffBot 00:00-00:00 untuk aktif sepanjang hari.`});return;
    }
    if(!botScheduleActive(botSettings))return;
    if(/^\/InviteUser\s+\+?[0-9][0-9\s-]{7,18}$/i.test(command)||/^\/KickUser\s+@?[^\s]+$/i.test(command)){
      const isInvite=/^\/InviteUser/i.test(command),allowed=isInvite?botSettings.allowInvite:botSettings.allowKick;
      if(!from.endsWith('@g.us')){await sock.sendMessage(from,{text:'Command ini hanya dapat digunakan di grup WhatsApp.'});return;}
      if(!allowed){await sock.sendMessage(from,{text:`Fitur ${isInvite?'InviteUser':'KickUser'} belum diizinkan di website.`});return;}
      const{entry:requester}=await getGroupParticipant(sock,from,sender),botEntry=await getGroupParticipant(sock,from,sock.user.id);
      if(!requester?.admin||!botEntry.entry?.admin){await sock.sendMessage(from,{text:'Pengguna dan bot harus menjadi admin grup.'});return;}
      if(isInvite){const raw=command.replace(/^\/InviteUser\s+/i,'').replace(/\D/g,''),jid=`${raw}@s.whatsapp.net`;try{await sock.groupParticipantsUpdate(from,[jid],'add');await sock.sendMessage(from,{text:`Pengguna +${raw} berhasil diundang.`})}catch(error){await sock.sendMessage(from,{text:`Gagal mengundang pengguna: ${error.message}`})}return;}
      const targetText=command.replace(/^\/KickUser\s+/i,'').trim(),targetMention=getMentionedJid(m.message)||targetText.match(/@([0-9]{8,15})/)?.[1]&&`${targetText.match(/@([0-9]{8,15})/)[1]}@s.whatsapp.net`,targetEntry=await getGroupParticipant(sock,from,targetMention||targetText),target=targetEntry.entry?.id||targetEntry.entry?.jid||targetMention;
      if(!target){await sock.sendMessage(from,{text:'Tag pengguna dengan format /KickUser @username atau @nomor.'});return;}
      try{await sock.groupParticipantsUpdate(from,[target],'remove');await sock.sendMessage(from,{text:`Pengguna ${mentionText(target)} berhasil dikeluarkan.`,mentions:[target]})}catch(error){await sock.sendMessage(from,{text:`Gagal mengeluarkan pengguna: ${error.message}`})}return;
    }
    if(botSettings.commandsEnabled&&/^\/set-BotProfile$/i.test(command)){
      const image=profileImages[senderNumber];if(!image){await sock.sendMessage(from,{text:'Kirim foto terlebih dahulu, lalu ketik /set-BotProfile.'});return;}
      try{await sock.updateProfilePicture(sock.user.id,image);delete profileImages[senderNumber];await sock.sendMessage(from,{text:'Foto profil bot berhasil diperbarui.'})}catch(error){await sock.sendMessage(from,{text:`Foto profil gagal diperbarui: ${error.message}`})}return;
    }
    if(botSettings.commandsEnabled&&/^\/set-BotUsername\s+(.+)$/i.test(command)){
      const username=command.match(/^\/set-BotUsername\s+(.+)$/i)?.[1]?.trim();if(!username||username.length>25){await sock.sendMessage(from,{text:'Username harus berisi 1-25 karakter.'});return;}
      try{await sock.updateProfileName(username);await sock.sendMessage(from,{text:`Nama profil bot berhasil diubah menjadi ${username}.`})}catch(error){await sock.sendMessage(from,{text:`Nama profil gagal diperbarui: ${error.message}`})}return;
    }
    if(botSettings.commandsEnabled&&/^\/set-AuthToken(?:\s+(.+))?$/i.test(command)){
      const suppliedToken=command.match(/^\/set-AuthToken(?:\s+(.+))?$/i)?.[1]?.trim();
      if(suppliedToken!==botSettings.botToken){await sock.sendMessage(from,{text:'AuthToken tidak valid.'});return;}
      if(!botSettings.authorizedNumbers.includes(senderNumber)){botSettings.authorizedNumbers.push(senderNumber);saveBotSettings(currentUserId,botSettings)}
      const panel=await sock.sendMessage(from,{text:whatsappAccountPanel(currentUserId)});if(panel?.key)authPanelKeys[panel.key.id]={userId:currentUserId,key:panel.key};return;
    }
    if(botSettings.commandsEnabled&&/^\/start$/i.test(command)){const panel=await sock.sendMessage(from,{text:whatsappAccountPanel(currentUserId)});if(panel?.key)authPanelKeys[panel.key.id]={userId:currentUserId,key:panel.key};return;}
    if(botSettings.commandsEnabled&&command.toLowerCase()==='/start-bot'){await sock.sendMessage(from,{text:botSettings.startBotText});return;}
    recordIncoming(currentUserId,text,receivedAt);
    const op=`./data/orders_${currentUserId}.json`;
    let orders=fs.existsSync(op)?JSON.parse(fs.readFileSync(op,'utf8')):[];
    orders.unshift({number:from.split('@')[0],message:text,time:new Date().toLocaleString('id-ID')});
    if(orders.length>50)orders.pop();
    fs.writeFileSync(op,JSON.stringify(orders,null,2));

    const antiPromo=getAntiPromo(currentUserId),messageSender=m.key.participant||m.participant;
    if(from.endsWith('@g.us')&&messageSender){
      const{metadata,senderEntry}=await getGroupParticipant(sock,from,messageSender).then(result=>({metadata:result.metadata,senderEntry:result.entry}));
      const senderIsAdmin=Boolean(senderEntry?.admin);
      if(senderIsAdmin&&/^\/whitelistuser\b/i.test(text.trim())){
        const taggedTarget=getMentionedJid(m.message)||text.match(/@([0-9]{8,15})/)?.[1]&&`${text.match(/@([0-9]{8,15})/)[1]}@s.whatsapp.net`;
        const targetEntry=metadata?.participants?.find(item=>sameWhatsAppUser(item,taggedTarget));
        const target=targetEntry?.id||targetEntry?.jid||taggedTarget;
        if(!target){await sock.sendMessage(from,{text:'Tag pengguna dengan format /whitelistuser @namapengguna'});return}
        if(!antiPromo.whitelist.some(jid=>sameWhatsAppUser(jid,target)))antiPromo.whitelist.push(target);
        saveAntiPromo(currentUserId,antiPromo);
        const targetMention=targetEntry?.phoneNumber||targetEntry?.id||target;
        await sock.sendMessage(from,{text:`${mentionText(targetMention)} berhasil di-whitelist dan boleh mengirim link/promosi.`,mentions:[targetMention]});
        return;
      }
      const isWhitelisted=antiPromo.whitelist.some(jid=>sameWhatsAppUser(jid,senderEntry||messageSender));
      const unsafe=detectUnsafeContent(text,antiPromo),promotion=detectPromotion(text,antiPromo);
      if((antiPromo.enabled&&!senderIsAdmin&&!isWhitelisted&&promotion.detected)||(unsafe.detected&&!senderIsAdmin&&!isWhitelisted)){
      try{await sock.sendMessage(from,{delete:m.key})}catch(error){console.error('[WA ANTI-PROMO DELETE]',error.message)}
      const replyText=unsafe.detected?antiPromo.obsceneReply:antiPromo.replyText;
      try{await sock.sendMessage(from,{text:`${mentionText(messageSender)} ${replyText}`,mentions:[messageSender]})}catch(error){console.error('[WA ANTI-PROMO REPLY]',error.message)}
      return;
      }
    }

    if(!from.endsWith('@g.us')){
      const limit=checkLimit(currentUserId,'autoReply');
      if(!limit.allowed)return;
      const dp=getUserDataPath(currentUserId);
      if(!fs.existsSync(dp))fs.writeFileSync(dp,'[]');
      const reply=JSON.parse(fs.readFileSync(dp,'utf8')).find(r=>r.trigger?.toLowerCase().trim()===text.toLowerCase().trim());
      if(reply){await delay(1000);await sock.sendMessage(from,{text:reply.response});recordResponse(currentUserId,receivedAt);addUsage(currentUserId,'autoReply')}
    }
  });
  sock.ev.on('messages.reaction',async({key:reactionKey,reaction})=>{
    if(!reaction?.text||!reactionKey?.id)return;
    const panel=authPanelKeys[reactionKey.id];
    if(!panel||panel.key.remoteJid!==reactionKey.remoteJid)return;
    const settings=getBotSettings(panel.userId),reactingUser=reactionKey.remoteJid;
    if(!isBotUserAllowed(reactingUser,settings,sock))return;
    try{await sock.sendMessage(panel.key.remoteJid,{delete:panel.key})}catch(error){console.error('[WA PANEL DELETE]',error.message)}
    delete authPanelKeys[reactionKey.id];
  });
  sock.ev.on('group-participants.update',async update=>{
    const info=socketInfo[key];
    if(!info)return;
    const settings=getBotSettings(info.userId);
    if(info.deviceId!==settings.botProviderDeviceId)return;
    if(!settings.whitelistUser)return;
    if(!botScheduleActive(settings))return;
    if(!settings.welcomeEnabled&&!settings.leaveEnabled)return;
    const action=update.action,participants=Array.isArray(update.participants)?update.participants:[];
    if(!['add','remove'].includes(action))return;
    const enabled=action==='add'?settings.welcomeEnabled:settings.leaveEnabled;
    if(!enabled)return;
    for(const participant of participants){
      const participantId=participant?.id||participant?.jid||participant,template=action==='add'?settings.welcomeText:settings.leaveText,text=replaceBotVariables(template,participantId),sent=await sendWhatsAppMessage(sock,update.id,{text,mentions:[participantId]},'WELCOME');
      if(action==='add'&&settings.welcomeDelete&&sent?.key)setTimeout(()=>sendWhatsAppMessage(sock,update.id,{delete:sent.key},'WELCOME DELETE'),settings.welcomeDeleteAfter*1000);
    }
  });
}

function parseNewsFeed(xml,keywords){const entries=[...String(xml||'').matchAll(/<item[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?(?:<link>([\s\S]*?)<\/link>)?[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/gi)];return entries.map(match=>({title:match[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,'').trim(),link:(match[2]||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim(),description:(match[3]||'').replace(/<[^>]+>/g,'').trim()})).filter(item=>keywords.some(word=>`${item.title} ${item.description}`.toLowerCase().includes(word))).slice(0,5)}
async function broadcastHypeNews(){const feedUrl=process.env.NEWS_FEED_URL;if(!feedUrl)return;for(const[sessionKey,info]of Object.entries(socketInfo)){const sock=socks[sessionKey],settings=getBotSettings(info.userId);if(info.deviceId!==settings.botProviderDeviceId||!sock?.user||!settings.newsEnabled||!botScheduleActive(settings)||!settings.newsGroups.length)continue;try{const response=await axios.get(feedUrl,{timeout:10000,responseType:'text'}),items=parseNewsFeed(response.data,settings.newsKeywords),statePath=`./data/news_state_${info.userId}.json`,state=readJson(statePath,{sent:[]});for(const item of items){const fingerprint=crypto.createHash('sha1').update(`${item.title}|${item.link}`).digest('hex');if(state.sent.includes(fingerprint))continue;const message=`Berita hype terdeteksi\n\n${item.title}\n${item.link||item.description}`;for(const groupId of settings.newsGroups)await sock.sendMessage(groupId,{text:message});state.sent.push(fingerprint)}state.sent=state.sent.slice(-100);writeJson(statePath,state)}catch(error){console.error('[WA NEWS]',error.message)}}}
setInterval(broadcastHypeNews,Number(process.env.NEWS_INTERVAL_MS||600000));

let telegramOffset=0,telegramRunning=false;
function telegramSettings(){const words=process.env.TELEGRAM_PROMO_WORDS?process.env.TELEGRAM_PROMO_WORDS.split(','):DEFAULT_ANTI_PROMO.words;return normalizeAntiPromo({enabled:process.env.TELEGRAM_PROMO_ENABLED==='true',replyText:process.env.TELEGRAM_PROMO_REPLY||DEFAULT_ANTI_PROMO.replyText,words})}
function escapeTelegramHtml(value){return String(value).replace(/[&<>]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[character]))}
function telegramMention(user){if(user?.username)return`@${user.username}`;if(user?.id)return`<a href="tg://user?id=${user.id}">${escapeTelegramHtml(user.first_name||'pengirim')}</a>`;return'@pengirim'}
async function telegramApi(token,method,payload){return axios.post(`https://api.telegram.org/bot${token}/${method}`,payload,{timeout:35000})}
async function startTelegramBot(){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token||telegramRunning)return;
  telegramRunning=true;
  console.log('[TELEGRAM] polling started');
  while(telegramRunning){
    try{
      const response=await telegramApi(token,'getUpdates',{offset:telegramOffset,timeout:25,allowed_updates:['message']});
      for(const update of response.data?.result||[]){
        telegramOffset=update.update_id+1;
        const message=update.message;
        const text=message?.text||'',chat=message?.chat;
        if(!message||!chat||!['group','supergroup'].includes(chat.type))continue;
        if(text==='/start'){await telegramApi(token,'sendMessage',{chat_id:chat.id,text:'Bot anti-promosi aktif. Jadikan bot admin agar dapat menghapus pesan.'});continue}
        const settings=telegramSettings();
        if(!settings.enabled||!detectPromotion(text,settings).detected)continue;
        try{await telegramApi(token,'deleteMessage',{chat_id:chat.id,message_id:message.message_id})}catch(error){console.error('[TELEGRAM DELETE]',error.response?.data?.description||error.message)}
        try{await telegramApi(token,'sendMessage',{chat_id:chat.id,text:`${telegramMention(message.from)} ${escapeTelegramHtml(settings.replyText)}`,parse_mode:'HTML',disable_web_page_preview:true})}catch(error){console.error('[TELEGRAM REPLY]',error.response?.data?.description||error.message)}
      }
    }catch(error){console.error('[TELEGRAM POLLING]',error.response?.data?.description||error.message);await delay(5000)}
  }
}

function canAddDevice(userId,deviceId){const plan=getUserBilling(userId).plan,limit=(LIMITS[plan]||LIMITS.Gratis).wa,existing=getDeviceIds(userId).includes(deviceId)||Boolean(socks[deviceKey(userId,deviceId)]);return existing||limit===-1||getUserDeviceCount(userId)<limit}
app.post('/connect-qr',isLoggedIn,async(req,res)=>{const userId=req.user.id,deviceId=safeDeviceId(req.body.deviceId);if(!canAddDevice(userId,deviceId))return res.status(403).json({success:false,message:`Batas perangkat paket ${getUserBilling(userId).plan} tercapai`});const key=deviceKey(userId,deviceId);lastCode[key]=null;await startSock(userId,deviceId);res.json({success:true,deviceId,message:`QR perangkat ${deviceId} berhasil dibuat`})});
app.post('/connect-number',isLoggedIn,async(req,res)=>{const userId=req.user.id,deviceId=safeDeviceId(req.body.deviceId);if(!canAddDevice(userId,deviceId))return res.status(403).json({success:false,message:`Batas perangkat paket ${getUserBilling(userId).plan} tercapai`});const key=deviceKey(userId,deviceId);if(!socks[key])await startSock(userId,deviceId);lastCode[key]=null;lastQr[key]=null;const{countryCode,number}=req.body;if(!countryCode||!number)return res.json({success:false,message:'countryCode dan number wajib diisi'});try{await delay(2000);const code=await socks[key].requestPairingCode(countryCode+number);lastCode[key]=code;res.json({success:true,message:`Kode perangkat ${deviceId} berhasil dibuat`,deviceId,code})}catch(e){res.json({success:false,message:e.message})}});
app.post('/logout-wa',isLoggedIn,async(req,res)=>{const userId=req.user.id,deviceId=safeDeviceId(req.body.deviceId),key=deviceKey(userId,deviceId);try{if(socks[key])await socks[key].logout();fs.rmSync(getUserSessionPath(userId,deviceId),{recursive:true,force:true});delete socks[key];delete socketInfo[key];lastQr[key]=null;lastCode[key]=null;res.json({success:true,deviceId,message:`Sesi perangkat ${deviceId} diputus`})}catch(e){res.json({success:false,message:e.message})}});

app.get('/', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/dashboard', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/custom', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/preview', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/order', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/analytics', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/api', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/billing', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/affiliate', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/account', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/admin', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/docs', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/faq', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/bug', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/tos', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/refund', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.get('/kontak', isLoggedIn, (req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));

app.use(isLoggedIn, (req,res,next)=>{
  if(req.path.startsWith('/api') || req.path.startsWith('/v1') || req.path.startsWith('/auth')) return next();
  res.sendFile(path.join(__dirname,'public/index.html'));
});

app.listen(PORT,async()=>{console.log('==========================================');console.log(`iCodeAutoResponder ${VERSION}`);console.log(`Local : http://localhost:${PORT}`);console.log(`Public : ${BASE_URL}`);console.log('==========================================');let folders=[];try{folders=fs.readdirSync(SESSION_FOLDER)}catch{}for(const userId of folders)for(const deviceId of getDeviceIds(userId))try{await startSock(userId,deviceId)}catch(e){console.error(`[WA START ERROR] ${userId}/${deviceId}:`,e.message)}startTelegramBot()});