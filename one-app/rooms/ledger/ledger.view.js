/* Proposal Ledger — the room's own furniture. Plain HTML; Hub puts it in the
   pane before the room is mounted. Two characters must not appear
   here, because the markup travels as a template literal: a
   backtick, and a dollar immediately followed by a brace. */
Hub.markup('ledger', `
<script id="pj-data" type="application/json">{}</script>

<div id="root">

  <!-- ══ THE HEADER ══ shell furniture rather than the board's own: the
       wordmark, and the board's controls. ══ -->
  <div class="hdr">
    <h1 class="hdr-mark">
      <button type="button" class="hdr-home" onclick="PL.home()"
        title="Return to the horizon" aria-label="Return to the start page and horizon view">
        <span class="hdr-mark-fl" aria-hidden="true">❧</span>
        The Proposal Ledger of the Free Peoples
        <span class="hdr-mark-fl" aria-hidden="true">❧</span>
      </button>
    </h1>
    <div class="hdr-right">
      <button class="btn btn-sm" id="hd-archive-btn" onclick="PL.toggleArchiveView()" style="display:none"><span id="archive-tab-label">Show archive</span></button>
      <button class="btn btn-primary btn-sm" onclick="PL.showNewForm()">+ Project</button>
      <button class="btn btn-primary btn-sm" onclick="PL.toggleQuickTodo()">+ Todo</button>
      <!-- The same chip Semaphore, Notes and the Atlas wear. The Ledger was
           the one room whose cloud had nowhere to fail out loud — a colour
           on the overflow button and a line inside a panel that is shut —
           and it is the one whose cloud failed silently for a fortnight.
           Pressing it opens the panel, which is where sync, the restore
           points and the cloud's own history all live. -->
      <button class="oa-cloudchip" id="pjcloud" type="button" data-state="off"
              onclick="PL.toggleCloudPanel()" title="Cloud sync">
        <i aria-hidden="true"></i><span>cloud</span>
      </button>
      <div class="hd-more-wrap">
        <button type="button" class="btn-collapse hd-more-btn" id="hd-more-btn" data-cloud-status="disconnected" onclick="PL.hdMoreToggle(event)" aria-haspopup="true" aria-expanded="false" aria-label="More actions. Cloud sync: not connected" title="More actions — Cloud sync: not connected"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle class="hd-status-dot" cx="12" cy="5" r="2.7"/><circle class="hd-status-dot" cx="12" cy="12" r="2.7"/><circle class="hd-status-dot" cx="12" cy="19" r="2.7"/></svg></button>
      </div>
    </div>
  </div>

  <!-- ══ THE BOARD PAGE ══ the beam, and one stage carrying whatever the
       beam currently heads. ══ -->
  <div id="board-view" class="view">

    <!-- Cloud sync -->
    <div class="inline-form" id="cloud-panel" style="display:none">
      <div class="cloud-panel-head">
        <div class="fsec fsec-first">Cloud sync (Supabase)</div>
        <button type="button" class="btn-collapse cloud-panel-close" onclick="PL.closeCloudPanel()" aria-label="Close cloud sync" title="Close">×</button>
      </div>
      <div id="cloud-setup-fields">
        <div class="cloud-help">
          This app's own Supabase project is filled in. Change the two values only to sync with another one, from its <b>Settings → API</b> page.
        </div>
        <div class="fg"><label>Project URL</label><input type="text" id="cloud-url" placeholder="https://xxxxxxxx.supabase.co" /></div>
        <div class="fg"><label>Anon public key</label><input type="text" id="cloud-key" placeholder="eyJhbGciOi..." /></div>
        <div class="form-row">
          <button class="btn btn-primary" onclick="PL.connectCloud()">Connect</button>
          <button class="btn" onclick="PL.connectCloudSafe()" title="Connect in read-only mode: this device will only download from the cloud and can never overwrite it.">Connect safe (download only)</button>
        </div>
      </div>
      <div id="cloud-connected-fields" style="display:none">
        <div class="fg"><span id="cloud-status-text" style="font-size:13px;color:var(--text2)">Not connected</span></div>
        <!-- The cloud answers only a logged-in Mark (since 2026-10-09), so
             this stands where the sync buttons do until there is a session,
             and nothing is read or sent before it. -->
        <div id="cloud-login-fields" style="display:none">
          <div class="cloud-help">
            Log in with the email and password of your user in this Supabase
            project. Once per device: it stays logged in until you log out.
          </div>
          <div class="fg"><label>Email</label><input type="email" id="cloud-email" autocomplete="username" /></div>
          <div class="fg"><label>Password</label><input type="password" id="cloud-pass" autocomplete="current-password" onkeydown="if(event.key==='Enter')PL.logInCloud()" /></div>
          <div class="form-row">
            <button class="btn btn-primary" onclick="PL.logInCloud()">Log in</button>
            <button class="btn" onclick="PL.disconnectCloud()">Disconnect</button>
          </div>
        </div>
        <div class="form-row" id="cloud-sync-row">
          <button class="btn" id="cloud-sync-now" onclick="PL.pushToCloud()">Sync now</button>
          <button class="btn" onclick="PL.checkCloud()" title="Read the cloud again and take its copy if this device has nothing unsent.">Check the cloud</button>
          <button class="btn" id="cloud-upload-toggle" onclick="PL.toggleUploadDisabled()">Disable upload (download only)</button>
          <button class="btn" onclick="PL.logOutCloud()" title="Stop syncing on this device until you log in again. Nothing on this device is removed.">Log out</button>
          <button class="btn" onclick="PL.disconnectCloud()">Disconnect</button>
        </div>
        <div class="cloud-help" id="cloud-who" style="margin-top:10px"></div>

        <div class="cloud-sec">
          <div class="cloud-sec-head">Restore points on this device</div>
          <div class="cloud-help">
            One is kept every time the app reads the cloud, and before anything
            replaces what is here — a download, an import, or another restore.
            The last three only: a journal is large and this browser's storage is
            shared with the app itself.
          </div>
          <div id="cloud-restore-list" class="cloud-list"></div>
        </div>

        <div class="cloud-sec">
          <div class="cloud-sec-head">Versions in the cloud</div>
          <div class="cloud-help">
            Every upload is kept — the last twenty — so a bad overwrite can be
            walked back from any machine, which a restore point sitting in this
            browser cannot do.
          </div>
          <div id="cloud-history-list" class="cloud-list"></div>
          <details class="cloud-sql-wrap">
            <summary>Set up the history table (once, in Supabase)</summary>
            <div class="cloud-help">
              Open your Supabase project, choose <b>SQL Editor</b>, paste all of
              this and press Run. Nothing already there is touched, and if you
              never do it everything else on this panel still works — the list
              above simply stays empty. It needs the lock (the owner check)
              in place first, and the lock script already makes this table.
            </div>
            <pre class="cloud-sql">create table if not exists app_state_history (
  id       bigserial primary key,
  row_id   text not null,
  data     jsonb not null,
  n        integer,
  saved_at timestamptz not null default now()
);

create index if not exists app_state_history_row_idx
  on app_state_history (row_id, saved_at desc);

alter table app_state_history enable row level security;

grant select, insert on app_state_history to authenticated;
grant usage on sequence app_state_history_id_seq to authenticated;
drop policy if exists "owner reads history" on app_state_history;
create policy "owner reads history" on app_state_history
  for select to authenticated using (public.is_owner());
drop policy if exists "owner adds history" on app_state_history;
create policy "owner adds history" on app_state_history
  for insert to authenticated with check (public.is_owner());

-- keep only the newest twenty versions of each row
create or replace function trim_app_state_history() returns trigger as $$
begin
  delete from app_state_history
   where id in (select id from app_state_history
                 where row_id = new.row_id
                 order by saved_at desc
                offset 20);
  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trim_history on app_state_history;
create trigger trim_history after insert on app_state_history
  for each row execute function trim_app_state_history();</pre>
          </details>
        </div>
      </div>
    </div>

    <!-- New project -->
    <!-- The beam: the board's header, and the app's navigation. -->
    <div id="hz-beam" class="hz-beam"></div>

    <!-- One positioned stage for everything the beam heads, so the tracker
         sheet has a definite thing to cover and a height to grow into. -->
    <div id="hz-stage">
      <div id="horizon-container"></div>
      <div id="projects-container" style="display:none"></div>

      <div id="ct-sheet" class="ct-sheet" aria-hidden="true">
        <div class="ct-turn" id="ct-turn">
          <div class="ct-turn-inner" id="ct-turn-inner">
            <div class="ct-turn-face ct-turn-project" id="ct-turn-project"
              aria-hidden="true"></div>
            <div class="ct-turn-face ct-turn-tracker">
              <div id="ct-view" class="view">
                <div class="wrap">
                  <div class="board" id="ct-board">
              <div class="board-main" id="ct-board-main">

                <div class="scale">
                  <div class="scale-lead"></div>
                  <div class="scale-label">
                    <div class="ct-project-title">
                      <button type="button" class="ct-head-title project-turn-title"
                        id="ct-proj-name" onclick="PL.closeTracker()"
                        aria-label="Flip back to this project's card"
                        title="Flip back to this project's card"></button>
                    </div>
                    <button class="btn btn-mini ct-addwp-btn" onclick="CT.addWP()">+ WP</button>
                  </div>
                  <div class="pmcol-drag" id="ct-pmcol-drag" title="Drag to resize the title column"></div>
                  <div class="pm-tags" id="ct-pmgrouphead"></div>
                  <div class="scale-body">
                    <div class="scale-ctl">
                      <button type="button" class="pm-tag-add" title="Add a PM column for another group" onclick="CT.addPmGroup()">+ Group</button>
                      <label class="months-field">
                        <input type="number" id="ct-months" min="1" max="120" value="36" onchange="CT.setMonths(this.value)" />
                        <span>months</span>
                      </label>
                      <div class="stat"><b id="ct-tot-pm">0</b><span>PM</span></div>
                      <span class="ct-ctl-sep" aria-hidden="true"></span>
                      <button class="gantt-toggle" id="ct-gantt-btn" onclick="CT.toggleGantt()" title="Overlay the Gantt chart on these rows">
                        <svg width="13" height="11" viewBox="0 0 13 11" fill="none"><rect x="0" y="1" width="7" height="2.4" rx="1.2" fill="currentColor"/><rect x="3" y="4.6" width="9" height="2.4" rx="1.2" fill="currentColor"/><rect x="1" y="8.2" width="6" height="2.4" rx="1.2" fill="currentColor"/></svg>
                        <span id="ct-gantt-lbl">Timeline</span>
                      </button>
                      <button class="gantt-toggle" id="ct-board-btn" onclick="CT.toggleBoard()" title="Show the uploaded board image alongside the WP titles">
                        <svg width="13" height="11" viewBox="0 0 13 11" fill="none"><rect x="0.5" y="0.5" width="12" height="10" rx="1.3" stroke="currentColor" fill="none"/><circle cx="3.6" cy="3.8" r="1.1" fill="currentColor"/><path d="M0.8 8.6L4.3 5.4L6.8 7.6L9.3 4.2L12.2 8.2" stroke="currentColor" stroke-width="1" fill="none"/></svg>
                        <span id="ct-board-lbl">Board</span>
                      </button>
                      <span class="ct-ctl-sep board-only" aria-hidden="true"></span>
                      <button class="btn btn-mini board-only" id="ct-boardimg-btn"
                        onclick="document.getElementById('ct-boardimg-input').click()">Replace image</button>
                      <button class="btn btn-mini board-only board-img-remove" id="ct-boardimg-remove"
                        onclick="CT.removeBoardImg()">Remove</button>
                    </div>
                    <div class="scale-lower">
                      <div class="scale-detail"><div class="col-notes"></div></div>
                      <div class="scale-lane" id="ct-scale-lane"></div>
                    </div>
                  </div>
                </div>

                <div class="rows-wrap" id="ct-rows-wrap">
                  <div class="rows" id="ct-rows"></div>
                  <input type="file" id="ct-boardimg-input" accept="image/png,image/jpeg" style="display:none" onchange="CT.uploadBoardImg(this.files[0])" />
                  <div class="board-overlay" id="ct-board-overlay">
                    <div class="board-overlay-imgwrap" id="ct-boardimg-wrap" style="display:none">
                      <img id="ct-boardimg" alt="Board" />
                    </div>
                    <div class="board-overlay-empty" id="ct-boardimg-empty">
                      <span>No board image for this project yet.</span>
                      <button class="btn btn-mini" onclick="document.getElementById('ct-boardimg-input').click()">Upload image</button>
                    </div>
                  </div>
                </div>

                <div id="ct-vpanel-host"></div>
              </div>
              <div class="vfoot" id="ct-vfoot"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- ══ THE NEW-TODO PANE ══ over the top of the board, in the shape the
       search palette and the dialog already wear. It sits outside the
       page because it opens from a keystroke as well as a button, and
       what is under it must not move. ══ -->
  <div id="qt" class="pf-host" hidden>
    <div class="pf-scrim" onclick="PL.closeQuickTodo()"></div>
    <div class="pf-box" id="qt-box" role="dialog" aria-modal="true" aria-labelledby="qt-title">
      <div class="pf-head">
        <span class="pf-dot" aria-hidden="true"></span>
        <span class="pf-title" id="qt-title">New todo</span>
        <span class="pf-where" id="qt-where"></span>
        <button type="button" class="btn-collapse pf-close" onclick="PL.closeQuickTodo()"
          aria-label="Close without adding" title="Close — Esc">×</button>
      </div>

      <div class="pf-body">
        <input type="text" id="qt-text" class="pf-name" maxlength="140" autocomplete="off"
          placeholder="Name it in a few words…" aria-label="What the todo is called"
          onkeydown="PL.quickTodoKey(event)" />

        <div class="pf-row qt-row-where">
          <div class="pf-fld">
            <label for="qt-call">Call</label>
            <select id="qt-call" class="pf-field" onchange="PL.quickTodoCall()"></select>
          </div>
          <div class="pf-fld">
            <label for="qt-project">Project</label>
            <select id="qt-project" class="pf-field" onchange="PL.quickTodoProject()"></select>
          </div>
        </div>

        <div class="pf-row qt-row-when">
          <div class="pf-fld">
            <label for="qt-due">Planned to do</label>
            <span class="qt-date" id="qt-due-wrap">
              <span class="qt-date-val" id="qt-due-lbl">Not set</span>
              <input type="text" inputmode="none" data-datefield id="qt-due" class="qt-date-input"
                readonly aria-label="Planned date"
                onclick="PL.openDatePicker(this)" onchange="PL.quickTodoDate()" />
              <button type="button" class="qt-date-clr" title="Clear the planned date"
                aria-label="Clear the planned date"
                onclick="PL.quickTodoClearDate('qt-due')">×</button>
            </span>
          </div>
          <div class="pf-fld">
            <label for="qt-deadline">Hard deadline</label>
            <span class="qt-date" id="qt-deadline-wrap">
              <span class="qt-date-val" id="qt-deadline-lbl">Not set</span>
              <input type="text" inputmode="none" data-datefield id="qt-deadline" class="qt-date-input"
                readonly aria-label="Deadline"
                onclick="PL.openDatePicker(this)" onchange="PL.quickTodoDate()" />
              <button type="button" class="qt-date-clr" title="Clear the deadline"
                aria-label="Clear the deadline"
                onclick="PL.quickTodoClearDate('qt-deadline')">×</button>
            </span>
          </div>
          <div class="pf-fld">
            <label for="qt-effort">Effort</label>
            <select id="qt-effort" class="pf-field"></select>
          </div>
          <div class="pf-fld">
            <label for="qt-category">Category</label>
            <select id="qt-category" class="pf-field"></select>
          </div>
        </div>

        <div class="qt-more" id="qt-more" hidden>
          <div id="qt-substamps-list"></div>
          <div class="qt-more-row">
            <input type="text" id="qt-substamp-input" class="add-substamp-input"
              placeholder="Add an update…" onkeydown="PL.quickTodoUpdateKey(event)" />
            <button type="button" class="btn btn-sm" onclick="PL.addPendingSubstamp('qt')">Add</button>
          </div>
        </div>
      </div>

      <div class="pf-foot">
        <button type="button" class="qt-more-btn" id="qt-more-btn"
          onclick="PL.quickTodoMore()">+ Add an update</button>
        <button type="button" class="btn btn-sm" onclick="PL.closeQuickTodo()">Cancel</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="PL.addQuickTodo()">Stamp &amp; add</button>
      </div>
    </div>
  </div>

  <!-- ══ THE BACKBONE EDITOR ══ over the top of everything, the same box
       the new-todo pane wears. Reached from the header's overflow menu —
       a backbone belongs to no one call, so it opens from the shell and
       not from a card. Authors key events by name and the todos that hang
       off them, both as offsets in weeks or months. ══ -->
  <div id="bb-editor" class="pf-host" hidden>
    <div class="pf-scrim" onclick="PL.backboneClose()"></div>
    <div class="pf-box bbe-box" id="bbe-box" role="dialog" aria-modal="true" aria-labelledby="bbe-head-title">
      <div class="pf-head">
        <span class="pf-dot" aria-hidden="true"></span>
        <span class="pf-title" id="bbe-head-title">Call backbones</span>
        <button type="button" class="btn-collapse pf-close" onclick="PL.backboneClose()"
          aria-label="Close" title="Close — Esc">×</button>
      </div>
      <div class="bbe-body">
        <div id="bbe-saved" class="bbe-saved"></div>

        <div class="fsec fsec-first" id="bbe-form-title">New backbone</div>
        <div class="fg"><label>Name</label>
          <input type="text" id="bbe-name" placeholder="e.g. ITEA round"
            onchange="PL.backboneNameField(this.value)" />
        </div>

        <div class="fsec">Key events</div>
        <div class="bbe-hint">Everything else in this backbone counts from
          one of these — mark one as the anchor: the date you will actually
          be given once the real call is announced.</div>
        <div id="bbe-events"></div>
        <button type="button" class="btn btn-sm btn-primary" onclick="PL.backboneEvAdd()">+ Add key event</button>

        <div class="fsec">Todos</div>
        <div class="bbe-hint">Work that hangs off one of the events above,
          counted the same way.</div>
        <div id="bbe-todos"></div>
        <button type="button" class="btn btn-sm btn-primary" onclick="PL.backboneTdAdd()">+ Add todo</button>
      </div>
      <div class="pf-foot">
        <button type="button" class="btn btn-sm" onclick="PL.backboneClose()">Close</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="PL.backboneSave()">Save backbone</button>
      </div>
    </div>
  </div>

  <!-- ══ THE PROJECT PANES ══ two boxes wearing the shell above: one
       for starting a project, one for editing the one already on a card.
       Both bodies are built in ledger.js so that the half they have in
       common — name, description, links, positions, type — is written
       once and cannot drift between them, which is exactly what happened
       while they were two hand-written forms. ══ -->
  <div id="np" class="pf-host" hidden>
    <div class="pf-scrim" onclick="PL.hideNewForm()"></div>
    <div class="pf-box pf-box-wide" id="np-box" role="dialog" aria-modal="true" aria-labelledby="np-title">
      <div class="pf-head">
        <span class="pf-dot" aria-hidden="true"></span>
        <span class="pf-title" id="np-title">New project</span>
        <button type="button" class="btn-collapse pf-close" onclick="PL.hideNewForm()"
          aria-label="Close without creating" title="Close — Esc">×</button>
      </div>
      <div class="pf-body" id="np-body"></div>
      <div class="pf-foot">
        <span class="pf-foot-note" id="np-foot-note"></span>
        <button type="button" class="btn btn-sm" onclick="PL.hideNewForm()">Cancel</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="PL.createProject()">Create project</button>
      </div>
    </div>
  </div>

  <div id="pe" class="pf-host" hidden>
    <div class="pf-scrim" onclick="PL.piCancelEdit()"></div>
    <div class="pf-box pf-box-wide" id="pe-box" role="dialog" aria-modal="true" aria-labelledby="pe-title">
      <div class="pf-head">
        <span class="pf-dot" aria-hidden="true"></span>
        <span class="pf-title" id="pe-title">Edit project</span>
        <button type="button" class="btn-collapse pf-close" onclick="PL.piCancelEdit()"
          aria-label="Close without saving" title="Close — Esc">×</button>
      </div>
      <div class="pf-body" id="pe-body"></div>
      <div class="pf-foot">
        <span class="pf-foot-note" id="pe-foot-note"></span>
        <button type="button" class="btn btn-sm" onclick="PL.piCancelEdit()">Cancel</button>
        <button type="button" class="btn btn-sm btn-primary" onclick="PL.piSaveEdit()">Save changes</button>
      </div>
    </div>
  </div>

</div><!-- #root -->


`);
