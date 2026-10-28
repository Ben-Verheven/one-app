/* ══════════ A lead's sheet ══════════
   A brokerage entry laid out to be sent to someone: one copy, read by
   Mark's Place, where it began (2026-10-23), and by the One App, whose
   bridge makes the same PDF and copy from a lead Mark's Place made (Mark,
   2026-10-28). Like the venue maths beside it, it keeps nothing and draws
   nothing: every function answers from what it is handed, the entry, the
   fields read off its page, the name of its site and the lead's own links.
   A plain script, so a copy opened from disk loads it as the site does;
   Mark's Place loads it from its own folder. */
var LeadSheet=(function(){
'use strict';
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function day(iso){ if (!iso) return ''; var d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
/* what an entry is called wherever it has no title of its own */
function title(e){ return e.org || e.contact || ('Entry ' + e.ext_id); }
/* An entry's page, read into the parts its sheet and Mark's Place's reader
   are laid out from: the long texts, the project description first because
   it says what they are after, who it is, and the short facts, the topic
   first. Every pair the site gives is kept, in the site's own words and
   order; only a pair the page repeats word for word (EPSS prints "Looking
   for" twice) is kept once. */
var MIDDLE = /description|cooperation interest|^title$/i;
var WHO = [[/^(organisation name|name of organisation\/institution\/company)$/i, 'Name of organisation'],
           [/^country$/i, 'Country'], [/^(name|contact name)$/i, 'Contact name'], [/^(email|email address)$/i, 'Email']];
var TOPIC = /^(topics?|priority areas|disciplines)$/i;
function isLongField(f){ return !TOPIC.test(f[0]) && (MIDDLE.test(f[0]) || String(f[1] || '').length > 220 || /\n\s*\n/.test(f[1] || '')); }
function entryParts(fields){
  var seen = {}, list = fields.filter(function(f){ var k = f[0] + '\u0000' + f[1]; if (seen[k]) return false; seen[k] = 1; return true; });
  var long = list.filter(isLongField), short = list.filter(function(f){ return !isLongField(f); });
  var first = /project description|cooperation interest/i;
  long.sort(function(a, b){ return (first.test(b[0]) ? 1 : 0) - (first.test(a[0]) ? 1 : 0); });
  var who = [];
  WHO.forEach(function(w){
    var i = short.findIndex(function(f){ return w[0].test(f[0]); });
    if (i >= 0) who.push([w[1], short.splice(i, 1)[0][1]]);
  });
  short = short.filter(function(f){ return TOPIC.test(f[0]); }).concat(short.filter(function(f){ return !TOPIC.test(f[0]); }));
  return { long:long, who:who, short:short };
}
/* ── a lead's sheet ──
   Mark asked on 2026-10-23 to send a lead's project to someone, laid out
   as he reads it here: PDF to attach, Copy for email to paste into the
   message itself. One sheet serves both, its styles written on each tag,
   because a mail program throws a <style> block away on paste. Facts the
   site left empty and his Why line stay out: they speak to him, not to
   whoever receives it. It is laid out as the reader on the upright iPad
   (Mark, 2026-10-23): the facts in a box on top, three to a row, who it is
   first and the rest after a rule, then the long texts the full width. The
   box is a table, the one layout every mail program keeps, and its colours
   are the room's tokens already laid on the sheet's ground, since Outlook
   reads no see-through colour. */
/* The site's own "website" was, on every lead Mark looked at (2026-10-23),
   the brokerage site's page for the entry again, sent out as the project's
   website beside its twin. A link is the project's own only when it leads
   off the brokerage site. */
function offSite(u, e){
  var host = function(x){ try { return new URL(/^https?:/i.test(x) ? x : 'https://' + x).hostname.replace(/^www\./, ''); } catch(err){ return ''; } };
  return !!u && host(u) !== host(e.url || '');
}
function sheetLinks(e, links){
  var web = (links || []).filter(function(k){ return k.label === 'project' && offSite(k.url, e); })[0];
  return [['Direct link to the project description', e.url]].concat(web ? [['Project website', web.url]] : []).filter(function(k){ return k[1]; });
}
/* The sheet leaves out what the site left empty; the reader, asked with
   all, keeps it, and says when the copier first saw the entry. */
function sheetParts(e, fields, site, all){
  var p = entryParts(fields || []), full = function(f){ return !/^[-–—\s]*$/.test(f[1] || ''); };
  /* The top of the sheet is three groups side by side, each about one
     thing (Mark, 2026-10-23): the organisation and where it is, the
     contact person and their job, and when the entry was posted and last
     changed. The job had read as one more fact about the organisation
     when it stood apart from the name. Whatever else the site gives
     follows under a rule, three to a row. */
  var pool = p.who.concat(p.short).filter(all ? Boolean : full), take = function(re){
    var i = pool.findIndex(function(f){ return re.test(f[0]); });
    var f = i < 0 ? null : pool.splice(i, 1)[0];
    return f && full(f) ? String(f[1]).trim() : '';
  };
  var org = take(/^(name of organisation|organisation name)$/i) || e.org || '', type = take(/^(organisation type|type of organisation)$/i);
  var city = take(/^city$/i), country = take(/^country$/i) || e.country || '', web = take(/^(web ?site|homepage)$/i);
  var name = take(/^(contact name|name)$/i) || e.contact || '', job = take(/^(job (position|title|function)|position|function)$/i);
  var mail = take(/^e-?mail( address)?$/i), phone = take(/phone/i), updated = take(/^last updated/i);
  var when = function(t){ return /^\d{4}-\d\d-\d\d/.test(t) ? day(t.slice(0, 10)) : t; }, posted = when(e.posted || '');
  updated = when(updated);
  var groups = [
    { head:'Organisation', lines:[[org, 'main'], [type, 'em'], [[city, country].filter(Boolean).join(', '), ''], [offSite(web, e) ? web : '', 'web']] },
    { head:'Contact', lines:[[name, 'main'], [job, 'em'], [mail, 'mail'], [phone, '']] },
    { head:'Dates', lines:[[updated ? 'Updated ' + updated : '', 'main'], [posted ? 'Posted ' + posted : '', ''], [all && e.first_seen ? 'First seen ' + day(e.first_seen) : '', '']] }
  ].map(function(g){ g.lines = g.lines.filter(function(l){ return l[0]; }); return g; }).filter(function(g){ return g.lines.length; });
  /* The organisation's name and the contact's no longer head the sheet
     (Mark, 2026-10-23): the box under it already says both. The project's
     own title heads it instead, where the site gives one. */
  var long = p.long.filter(all ? Boolean : full), t = long.findIndex(function(f){ return /^title$/i.test(f[0]); });
  var head = take(/^(project (title|name|acronym)|acronym|project)$/i) || (t >= 0 ? String(long.splice(t, 1)[0][1]).trim() : '');
  /* What the project answers, in words someone outside Mark's own can
     read (Mark, 2026-10-23): the venue as the programme, then the topic,
     each named, the names set apart from what they name; the kind of
     entry ("Seeks partners") is his sorting and stays off. */
  return { where:[['Programme', site], ['Topic', e.topic || '']].filter(function(w){ return w[1]; }), head:head, groups:groups,
           long:long, rest:pool.filter(function(f){ return !(e.topic && /^topics?$/i.test(f[0]) && f[1].trim() === e.topic.trim()); }) };
}
function sheetHTML(e, fields, site, links){
  var p = sheetParts(e, fields, site), C = { sheet:'#FAF7F0', field:'#FCFAF3', ink:'#282420', muted:'#5E574B', faint:'#6A6250', key2:'#3A342C', line:'#D5D1CB', line2:'#B7B4AD' };
  var serif = "font-family:Optima,'Palatino Linotype','Book Antiqua',Georgia,serif;", body = "font-family:'Iowan Old Style','Palatino Linotype','Book Antiqua',Georgia,serif;";
  var a = function(u, t){ return '<a href="' + u + '" style="color:' + C.key2 + ';text-decoration:underline;text-underline-offset:2px">' + t + '</a>'; };
  var linked = function(t){ return esc(t).replace(/https?:\/\/[^\s<]+/g, function(u){ return a(u, u); }); };
  var label = function(t){ return '<div style="' + serif + 'font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:' + C.faint + ';margin-bottom:3px">' + esc(t) + '</div>'; };
  var line = function(l){
    var v = l[1] === 'mail' ? a('mailto:' + esc(l[0]), esc(l[0])) : l[1] === 'web' ? a(esc(/^https?:/i.test(l[0]) ? l[0] : 'https://' + l[0]), esc(l[0].replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))) : esc(l[0]);
    return '<div style="' + body + 'overflow-wrap:anywhere;' + (l[1] === 'main' ? 'font-size:15px;line-height:1.35;color:' + C.ink + ';margin-bottom:2px'
      : 'font-size:13px;line-height:1.45;color:' + (l[1] === 'em' ? C.muted + ';font-style:italic' : C.ink)) + '">' + v + '</div>'; };
  var w = p.groups.length ? Math.floor(100 / p.groups.length) : 100;
  var top = p.groups.map(function(g, i){
    return '<td style="vertical-align:top;width:' + w + '%;padding:2px 14px;' + (i ? 'border-left:1px solid ' + C.line + ';' : '') + '">' + label(g.head) + g.lines.map(line).join('') + '</td>'; }).join('');
  var fact = function(f){
    return '<td style="vertical-align:top;width:33%;padding:5px 14px">' + label(f[0].replace(/^Link to 'research gate' or equivalent$/i, 'Research profile'))
      + '<div style="' + body + 'font-size:13px;line-height:1.45;color:' + C.ink + ';overflow-wrap:anywhere">' + linked(f[1]).replace(/\n/g, '<br>') + '</div></td>'; };
  var rows = '';
  for (var i = 0; i < p.rest.length; i += 3){
    var r = p.rest.slice(i, i + 3);
    rows += '<tr>' + r.map(fact).join('') + (r.length < 3 ? '<td colspan="' + (3 - r.length) + '"></td>' : '') + '</tr>';
  }
  var facts = top || rows
    ? '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;background:' + C.field + ';border:1px solid ' + C.line + ';border-radius:7px;margin-top:18px">'
      + (top ? '<tr><td style="padding:12px 0"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse"><tr>' + top + '</tr></table></td></tr>' : '')
      + (rows ? '<tr><td style="padding:7px 0 9px;' + (top ? 'border-top:1px solid ' + C.line + ';' : '') + '"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse">' + rows + '</table></td></tr>' : '')
      + '</table>'
    : '';
  var texts = p.long.map(function(f, i){
    return '<div style="margin-top:22px;page-break-inside:auto"><div style="' + serif + 'font-size:13px;letter-spacing:.07em;text-transform:uppercase;color:' + C.faint + ';margin:0 0 6px">' + esc(f[0]) + '</div>'
      + String(f[1]).split(/\n\s*\n/).map(function(t){
          return '<p style="' + body + 'margin:0 0 .7em;font-size:' + (i === 0 ? 16 : 15.5) + 'px;line-height:1.6;color:' + C.ink + '">' + linked(t).replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div>'; }).join('');
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:700px;border-collapse:collapse;background:' + C.sheet + '"><tr><td style="padding:22px 26px 14px">'
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">' + p.where.map(function(w){
        return '<tr><td style="vertical-align:baseline;width:92px;padding:1px 0;' + serif + 'font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:' + C.faint + '">' + esc(w[0]) + '</td>'
          + '<td style="vertical-align:baseline;' + body + 'font-size:14px;line-height:1.45;color:' + C.ink + ';padding:1px 0">' + esc(w[1]) + '</td></tr>'; }).join('') + '</table>'
    + (p.head ? '<div style="' + serif + 'font-weight:400;font-size:25px;line-height:1.25;color:' + C.ink + ';margin:12px 0 0">' + esc(p.head) + '</div>' : '')
    + facts + texts
    + '<div style="' + body + 'font-size:12px;color:' + C.faint + ';border-top:1px solid ' + C.line + ';margin-top:18px;padding-top:9px;overflow-wrap:anywhere">'
    + sheetLinks(e, links).map(function(k){ return esc(k[0]) + ': ' + a(esc(k[1]), esc(k[1])); }).join('<br>') + '</div>'
    + '</td></tr></table>';
}
function sheetText(e, fields, site, links){
  var p = sheetParts(e, fields, site);
  return p.where.map(function(w){ return w[0] + ': ' + w[1]; }).concat(p.head ? ['', p.head] : []).join('\n') + '\n\n'
    + p.groups.map(function(g){ return g.head.toUpperCase() + '\n' + g.lines.map(function(l){ return l[0]; }).join('\n'); }).join('\n\n') + '\n\n'
    + p.rest.map(function(f){ return f[0] + ': ' + f[1]; }).join('\n') + '\n\n'
    + p.long.map(function(f){ return f[0].toUpperCase() + '\n' + f[1]; }).join('\n\n') + '\n\n'
    + sheetLinks(e, links).map(function(k){ return k[0] + ': ' + k[1]; }).join('\n');
}
/* Both forms go on the clipboard: the laid-out one for a mail program,
   the plain one for anywhere that takes only text. The older copy command
   stands in where the browser's clipboard refuses. Either may be handed
   as a promise, for a page that has still to fetch the entry: the
   browser's clipboard waits for it within the press, which it would not
   do for a write begun after the fetch (the One App's leads, 2026-10-28).
   The older command cannot wait, so it stands in only for text in hand. */
function copy(html, text, done){
  var old = function(){
    if (typeof html !== 'string') return done(false);
    var put = function(ev){ ev.clipboardData.setData('text/html', html); ev.clipboardData.setData('text/plain', text); ev.preventDefault(); };
    document.addEventListener('copy', put, { once:true });
    var ok = document.execCommand('copy');
    document.removeEventListener('copy', put);
    done(ok);
  };
  var blob = function(v, type){ return Promise.resolve(v).then(function(t){ return new Blob([t], { type:type }); }); };
  if (navigator.clipboard && window.ClipboardItem){
    navigator.clipboard.write([new ClipboardItem({ 'text/html':blob(html, 'text/html'), 'text/plain':blob(text, 'text/plain') })])
      .then(function(){ done(true); }, old);
  } else old();
}
return { title:title, isLongField:isLongField, entryParts:entryParts, offSite:offSite,
         parts:sheetParts, html:sheetHTML, text:sheetText, copy:copy };
})();
