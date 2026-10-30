/* ============================================================
   Shared site behavior
   - Sticky header shadow on scroll
   - Mobile hamburger menu
   - Scroll-reveal animations
   - Footer year
   - Contact form friendly confirmation
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Sticky header shadow ---------- */
  var header = document.querySelector(".header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile navigation ---------- */
  var menuToggle = document.getElementById("menu-toggle");
  var navLinks = document.getElementById("nav-links");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
      var isOpen = navLinks.classList.toggle("is-open");
      menuToggle.classList.toggle("is-open", isOpen);
      menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Close menu" : "Open menu"
      );
    });

    // Close the menu after tapping a link
    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("is-open");
        menuToggle.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Scroll-reveal animations ---------- */
  var revealEls = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window && revealEls.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // No observer support — just show everything
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Contact form (saves to Supabase) ---------- */
  var form = document.getElementById("contact-form");
  if (form) {
    var CONTACT_SUPABASE_URL = "https://ftjtbesehalgjfuccjhl.supabase.co";
    var CONTACT_SUPABASE_KEY = "sb_publishable_2BWnyx_Fh1a-zYLqNwZMgw_fphBslQW";

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var note = document.getElementById("form-note");
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      if (note) {
        note.classList.add("is-visible");
        note.textContent = "Sending your message…";
      }

      var payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        message: form.message.value.trim()
      };

      fetch(CONTACT_SUPABASE_URL + "/rest/v1/contacts", {
        method: "POST",
        headers: {
          apikey: CONTACT_SUPABASE_KEY,
          Authorization: "Bearer " + CONTACT_SUPABASE_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error("Supabase responded " + res.status);
          if (note) {
            note.textContent =
              "Thanks for reaching out! Your message has been sent — I'll get back to you soon.";
          }
          form.reset();
        })
        .catch(function (err) {
          console.error("Contact form save failed:", err);
          if (note) {
            note.textContent =
              "Oops — something went wrong and your message wasn't sent. Please try again in a moment.";
          }
        })
        .then(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }
})();

/* ============================================================
   Projects page — Interactive To-Do List
   - Month calendar with date selection
   - Add / toggle / edit / delete tasks
   - Syncs to a Supabase `todos` table
   ============================================================ */
(function () {
  "use strict";

  var listEl = document.getElementById("todo-list");
  if (!listEl) return;

  var formEl = document.getElementById("todo-form");
  var inputEl = document.getElementById("todo-task");
  var calWidget = document.getElementById("todo-calendar");
  var calBody = document.getElementById("todo-cal-body");
  var calTitle = document.getElementById("todo-cal-title");
  var selectedLabel = document.getElementById("todo-selected-date");
  var countEl = document.getElementById("todo-count");
  var emptyEl = document.getElementById("todo-empty");

  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* ---------- Supabase client ---------- */
  var SUPABASE_URL = "https://klxsmjxhvhmplmhmcykd.supabase.co";
  var SUPABASE_KEY = "sb_publishable_tiSa1unyWLRIsjPw2M64CQ_x12ZYkSh";
  var supa = null;
  if (window.supabase && typeof window.supabase.createClient === "function") {
    try {
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.error("Supabase init failed:", e);
    }
  }

  var today = atStartOfDay(new Date());
  var viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  var selectedDate = new Date(today);
  var tasks = [];
  var selectedEmoji = "\u{1F4DD}";
  var selectedPriority = "medium";
  var selectedTime = "";

  /* ---------- storage (Supabase) ---------- */
  // `todos` table columns: id (int), task (text), is_complete (bool),
  // date (date), created_at (timestamptz), emoji (text), priority (text),
  // time (text — '' means "all day").
  function mapRow(r) {
    return {
      id: r.id,
      text: r.task !== undefined ? r.task : r.text,
      date: typeof r.date === "string" ? r.date : (r.date ? isoDate(parseIso(r.date)) : ""),
      emoji: r.emoji || "\u{1F4DD}",
      priority: r.priority || "medium",
      time: r.time || "",
      done: r.is_complete !== undefined ? !!r.is_complete : !!r.done,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : 0
    };
  }
  function fetchTasks() {
    if (!supa) return Promise.resolve([]);
    return supa
      .from("todos")
      .select("*")
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        // renderList() does the final date->time->createdAt sort in JS so
        // all-day tasks (time === '') sink to the bottom of each day group.
        return (res.data || []).map(mapRow);
      });
  }
  function insertTask(t) {
    var row = {
      task: t.text,
      date: t.date,
      emoji: t.emoji || "\u{1F4DD}",
      priority: t.priority || "medium",
      time: t.time || "",
      is_complete: !!t.done
    };
    return supa
      .from("todos")
      .insert(row)
      .select("*")
      .then(function (res) {
        if (res.error) throw res.error;
        return mapRow(res.data[0]);
      });
  }
  function updateTask(id, patch) {
    // Map local field names -> DB column names
    var row = {};
    if ("text" in patch) row.task = patch.text;
    if ("done" in patch) row.is_complete = patch.done;
    if ("emoji" in patch) row.emoji = patch.emoji;
    if ("priority" in patch) row.priority = patch.priority;
    if ("time" in patch) row.time = patch.time || "";
    return supa
      .from("todos")
      .update(row)
      .eq("id", id)
      .then(function (res) {
        if (res.error) throw res.error;
      });
  }
  function removeTask(id) {
    return supa
      .from("todos")
      .delete()
      .eq("id", id)
      .then(function (res) {
        if (res.error) throw res.error;
      });
  }

  /* ---------- UI status helpers ---------- */
  var addBtn = formEl ? formEl.querySelector(".todo-add") : null;
  function setSaving(isOn) {
    if (!addBtn) return;
    addBtn.disabled = !!isOn;
    addBtn.classList.toggle("is-loading", !!isOn);
    addBtn.textContent = isOn ? "Saving…" : "Add";
  }
  function showError(msg) {
    if (!emptyEl) return;
    emptyEl.textContent = msg;
    emptyEl.classList.add("is-error");
    emptyEl.classList.remove("is-hidden");
  }
  function fmtErr(err, fallback) {
    var m = err && err.message ? err.message : String(err);
    if (m.length > 140) m = m.slice(0, 137) + "...";
    return fallback + " (" + m + ")";
  }
  function clearError() {
    if (!emptyEl) return;
    emptyEl.textContent = "No tasks yet — pick a date and add one!";
    emptyEl.classList.remove("is-error");
  }

  /* ---------- date helpers ---------- */
  function atStartOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }
  function formatShort(d) {
    return SHORT_MONTHS[d.getMonth()] + " " + d.getDate();
  }
  function formatLabel(d) {
    if (sameDay(d, today)) return "today";
    var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (sameDay(d, tomorrow)) return "tomorrow";
    return formatShort(d);
  }
  function formatTime(hhmm) {
    if (!hhmm) return "";
    var p = hhmm.split(":");
    var h = parseInt(p[0], 10);
    var m = p[1];
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + m + " " + suffix;
  }
  function priorityFires(p) {
    if (p === "low") return "\u{1F525}";
    if (p === "high") return "\u{1F525}\u{1F525}\u{1F525}";
    return "\u{1F525}\u{1F525}"; // medium (default)
  }
  function isoDate(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function parseIso(iso) {
    var p = iso.split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function hasTaskOn(date) {
    return tasks.some(function (t) { return sameDay(parseIso(t.date), date); });
  }

  /* ---------- calendar render ---------- */
  function renderCalendar() {
    calTitle.textContent = MONTHS[viewMonth.getMonth()] + " " + viewMonth.getFullYear();
    var first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    var startWeekday = first.getDay();
    var daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    var cells = [];

    for (var i = 0; i < startWeekday; i++) cells.push(null);
    for (var d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);

    var html = "";
    for (var row = 0; row < cells.length; row += 7) {
      html += "<tr>";
      for (var c = row; c < row + 7; c++) {
        var date = cells[c];
        if (!date) {
          html += '<td class="todo-cal-cell is-blank"></td>';
        } else {
          var classes = ["todo-cal-cell"];
          if (sameDay(date, today)) classes.push("is-today");
          if (sameDay(date, selectedDate)) classes.push("is-selected");
          if (hasTaskOn(date)) classes.push("has-tasks");
          html += '<td class="' + classes.join(" ") + '">' +
                  '<button type="button" data-date="' + isoDate(date) + '">' +
                  date.getDate() + '</button></td>';
        }
      }
      html += "</tr>";
    }
    calBody.innerHTML = html;
  }

  /* ---------- list render ---------- */
  function buildItem(t) {
    var li = document.createElement("li");
    li.className = "todo-item" + (t.done ? " is-done" : "");
    li.dataset.id = t.id;

    var check = document.createElement("button");
    check.type = "button";
    check.className = "todo-check" + (t.done ? " is-checked" : "");
    check.setAttribute("role", "checkbox");
    check.setAttribute("aria-checked", t.done ? "true" : "false");
    check.setAttribute("aria-label", t.done ? "Mark as not done" : "Mark as done");
    check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

    var body = document.createElement("div");
    body.className = "todo-body";

    var text = document.createElement("div");
    text.className = "todo-text";
    var emoji = document.createElement("span");
    emoji.className = "todo-emoji-inline";
    emoji.textContent = t.emoji || "📝";
    var textVal = document.createElement("span");
    textVal.className = "todo-text-value";
    textVal.title = "Click to edit";
    textVal.textContent = t.text;
    text.appendChild(emoji);
    text.appendChild(textVal);

    var meta = document.createElement("div");
    meta.className = "todo-meta";
    var pr = t.priority || "medium";
    var badge = document.createElement("span");
    badge.className = "todo-priority-badge";
    badge.dataset.priority = pr;
    badge.title = pr.charAt(0).toUpperCase() + pr.slice(1) + " priority";
    badge.setAttribute("aria-label", pr + " priority");
    badge.textContent = priorityFires(pr);
    meta.appendChild(badge);
    if (t.time) {
      var timeChip = document.createElement("span");
      timeChip.className = "todo-time-chip";
      timeChip.textContent = formatTime(t.time);
      meta.appendChild(timeChip);
    }

    body.appendChild(text);
    body.appendChild(meta);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "todo-del";
    del.setAttribute("aria-label", "Delete task");
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(del);
    return li;
  }

  function groupDayLabel(d) {
    if (sameDay(d, today)) return "Today";
    var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (sameDay(d, tomorrow)) return "Tomorrow";
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }

  function renderList() {
    var sorted = tasks.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // Within one day: unfinished tasks (0) above completed ones (1)
      if (a.done !== b.done) return a.done ? 1 : -1;
      var ta = a.time || "99:99";
      var tb = b.time || "99:99";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.createdAt - b.createdAt;
    });

    listEl.innerHTML = "";

    var groups = [];
    var current = null;
    sorted.forEach(function (t) {
      if (!current || current.key !== t.date) {
        current = { key: t.date, date: parseIso(t.date), items: [] };
        groups.push(current);
      }
      current.items.push(t);
    });

    groups.forEach(function (g) {
      var group = document.createElement("div");
      group.className = "todo-group";

      var dateCol = document.createElement("div");
      dateCol.className = "todo-group-date";
      var day = document.createElement("span");
      day.className = "todo-group-day";
      day.textContent = groupDayLabel(g.date);
      var sub = document.createElement("span");
      sub.className = "todo-group-sub";
      sub.textContent = formatShort(g.date);
      dateCol.appendChild(day);
      dateCol.appendChild(sub);

      var items = document.createElement("ul");
      items.className = "todo-group-items";
      g.items.forEach(function (t) {
        items.appendChild(buildItem(t));
      });

      group.appendChild(dateCol);
      group.appendChild(items);
      listEl.appendChild(group);
    });

    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    countEl.textContent = total === 0
      ? "0 tasks"
      : done + " of " + total + " tasks completed";

    emptyEl.classList.toggle("is-hidden", tasks.length > 0);
  }

  function updateSelectedLabel() {
    selectedLabel.textContent = formatLabel(selectedDate);
  }

  /* ---------- actions ---------- */
  function addTask(text) {
    var draft = {
      text: text,
      date: isoDate(selectedDate),
      emoji: selectedEmoji,
      priority: selectedPriority,
      time: selectedTime,
      done: false
    };
    setSaving(true);
    clearError();
    insertTask(draft).then(function (saved) {
      tasks.push(saved);
      renderList();
      renderCalendar();
    }).catch(function (err) {
      console.error("Insert failed:", err);
      showError(fmtErr(err, "Could not save this task"));
    }).finally(function () {
      setSaving(false);
    });
  }

  function toggleTask(id) {
    var t = tasks.find(function (x) { return String(x.id) === String(id); });
    if (!t) return;
    var nextDone = !t.done;
    t.done = nextDone;
    renderList();
    updateTask(id, { done: nextDone }).catch(function (err) {
      console.error("Toggle failed:", err);
      t.done = !nextDone;
      renderList();
      showError(fmtErr(err, "Could not update the task — reverted"));
    });
  }

  function deleteTask(id) {
    var backup = tasks.find(function (x) { return String(x.id) === String(id); });
    tasks = tasks.filter(function (t) { return String(t.id) !== String(id); });
    renderList();
    renderCalendar();
    removeTask(id).catch(function (err) {
      console.error("Delete failed:", err);
      if (backup) tasks.push(backup);
      renderList();
      renderCalendar();
      showError(fmtErr(err, "Could not delete the task — restored"));
    });
  }

  /* ---------- events ---------- */
  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = inputEl.value.trim();
    if (!v) return;
    addTask(v);
    inputEl.value = "";
    resetPickers();
    inputEl.focus();
  });

  /* ---------- emoji + priority + time pickers ---------- */
  var emojiRow = document.getElementById("todo-emoji-row");
  var priorityRow = document.getElementById("todo-priority-row");
  var timeRow = document.getElementById("todo-time-row");

  if (emojiRow) {
    emojiRow.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo-emoji");
      if (!btn) return;
      selectedEmoji = btn.dataset.emoji;
      emojiRow.querySelectorAll(".todo-emoji").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      inputEl.focus();
    });
  }

  if (priorityRow) {
    priorityRow.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo-priority");
      if (!btn) return;
      selectedPriority = btn.dataset.priority;
      priorityRow.querySelectorAll(".todo-priority").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      inputEl.focus();
    });
  }

  var customTimeInput = document.getElementById("todo-time-native");
  var customTimeLabel = document.querySelector(".todo-time-label");

  if (timeRow) {
    timeRow.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo-time");
      if (!btn) return;
      // Custom time is handled by the native <input type="time"> below
      if (btn.classList.contains("todo-time--custom")) return;
      selectedTime = btn.dataset.time;
      timeRow.querySelectorAll(".todo-time").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      // Reset the custom picker display since a preset was chosen
      if (customTimeLabel) customTimeLabel.textContent = "Custom";
      if (customTimeInput) customTimeInput.value = "";
      inputEl.focus();
    });
  }

  if (customTimeInput) {
    customTimeInput.addEventListener("input", function () {
      var v = customTimeInput.value; // "HH:MM" or ""
      selectedTime = v;
      if (customTimeLabel) {
        customTimeLabel.textContent = v ? formatTime(v) : "Custom";
      }
      // Deactivate preset chips, activate the Custom label
      if (timeRow) {
        timeRow.querySelectorAll(".todo-time").forEach(function (b) {
          if (b.classList.contains("todo-time--custom")) {
            b.classList.add("is-active");
          } else {
            b.classList.remove("is-active");
          }
        });
      }
    });
  }

  function resetPickers() {
    selectedEmoji = "\u{1F4DD}";
    selectedPriority = "medium";
    selectedTime = "";
    if (emojiRow) {
      emojiRow.querySelectorAll(".todo-emoji").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.emoji === selectedEmoji);
      });
    }
    if (priorityRow) {
      priorityRow.querySelectorAll(".todo-priority").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.priority === selectedPriority);
      });
    }
    if (timeRow) {
      timeRow.querySelectorAll(".todo-time").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.time === selectedTime);
      });
    }
    if (customTimeLabel) customTimeLabel.textContent = "Custom";
    if (customTimeInput) customTimeInput.value = "";
  }

  listEl.addEventListener("click", function (e) {
    var li = e.target.closest(".todo-item");
    if (!li) return;
    var id = li.dataset.id;
    if (e.target.closest(".todo-del")) {
      deleteTask(id);
    } else if (e.target.closest(".todo-check")) {
      toggleTask(id);
    } else if (
      e.target.closest(".todo-text") &&
      !e.target.closest(".todo-edit-input")
    ) {
      editItem(li);
    }
  });

  function editItem(li) {
    if (li.querySelector(".todo-edit-input")) return; // already editing
    var id = li.dataset.id;
    var t = tasks.find(function (x) { return String(x.id) === String(id); });
    if (!t) return;
    var valueEl = li.querySelector(".todo-text-value");
    if (!valueEl) return;

    var input = document.createElement("input");
    input.type = "text";
    input.className = "todo-edit-input";
    input.value = t.text;
    input.maxLength = 120;
    input.setAttribute("aria-label", "Edit task text");
    valueEl.replaceWith(input);
    input.focus();
    input.select();

    var settled = false;
    function commit() {
      if (settled) return;
      settled = true;
      var v = input.value.trim();
      if (v && v !== t.text) {
        var oldText = t.text;
        t.text = v;
        renderList();
        updateTask(t.id, { text: v }).catch(function (err) {
          console.error("Edit failed:", err);
          t.text = oldText;
          renderList();
          showError(fmtErr(err, "Could not save your edit — reverted"));
        });
      } else {
        renderList();
      }
    }
    function cancel() {
      if (settled) return;
      settled = true;
      renderList();
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", commit);
  }

  calWidget.addEventListener("click", function (e) {
    var nav = e.target.closest(".todo-cal-nav");
    if (nav) {
      var dir = nav.dataset.dir === "next" ? 1 : -1;
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + dir, 1);
      renderCalendar();
      return;
    }
    var cellBtn = e.target.closest("[data-date]");
    if (cellBtn) {
      selectedDate = parseIso(cellBtn.dataset.date);
      updateSelectedLabel();
      renderCalendar();
    }
  });

  /* ---------- init ---------- */
  updateSelectedLabel();
  renderCalendar();
  renderList();
  if (supa) {
    setSaving(true);
    fetchTasks().then(function (rows) {
      tasks = rows;
      renderList();
      renderCalendar();
    }).catch(function (err) {
      console.error("Load failed:", err);
      showError(fmtErr(err, "Could not load tasks from Supabase"));
    }).finally(function () {
      setSaving(false);
    });
  } else {
    showError("Supabase SDK failed to load — to-do app is offline.");
  }
})();

/* ============================================================
   Projects page — Weather search
   - Looks a city up through the UAPI weather endpoint
   - Shows the city, temperature, conditions and a matching icon
   ============================================================ */
(function () {
  "use strict";

  var formEl = document.getElementById("weather-form");
  if (!formEl) return;

  var inputEl = document.getElementById("weather-city");
  var searchBtn = formEl.querySelector(".weather-search-btn");
  var noteEl = document.getElementById("weather-note");
  var suggestEl = document.getElementById("weather-suggest");
  var chipsEl = document.getElementById("weather-suggest-chips");
  var resultEl = document.getElementById("weather-result");
  var iconEl = document.getElementById("weather-icon");
  var cityEl = document.getElementById("weather-city-name");
  var tempEl = document.getElementById("weather-temp");
  var condEl = document.getElementById("weather-condition");

  var API_URL = "https://uapis.cn/api/v1/misc/weather";

  var MSG_EMPTY = "Enter a city first.";
  var MSG_LOADING = "Loading\u2026";
  var MSG_NOT_FOUND = "Couldn\u2019t find that city \u2014 check the spelling.";
  var MSG_DOESNT_EXIST = "That city doesn\u2019t exist.";
  var MSG_OFFLINE = "Couldn\u2019t reach the weather service \u2014 please try again.";

  /* The API returns its `weather_icon` as a QWeather numeric code:
     100s clear · 101-104 cloud · 300s rain · 400s snow · 500s+ fog, haze, dust. */
  var SVG_OPEN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

  var ICONS = {
    clear: SVG_OPEN + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    cloudy: SVG_OPEN + '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.5A4 4 0 0 0 7 19z"/></svg>',
    rain: SVG_OPEN + '<path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><path d="M16 13v8M8 13v8M12 15v8"/></svg>',
    snow: SVG_OPEN + '<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01"/></svg>',
    fog: SVG_OPEN + '<path d="M4 8h16M6 12h12M4 16h16"/></svg>'
  };

  function iconKey(iconCode) {
    var n = parseInt(iconCode, 10);
    if (isNaN(n)) return "cloudy";
    if (n === 100 || n === 150) return "clear";
    if (n >= 300 && n < 400) return "rain";
    if (n >= 400 && n < 500) return "snow";
    if (n >= 500) return "fog";
    return "cloudy";
  }

  /* ---------- "Did you mean" suggestions + result validation ----------
     The API fuzzy-matches on its own and may return HTTP 200 with an
     UNRELATED city (e.g. "zzzzzz" -> 福州市), so every 200 response is
     checked against what was typed before it is shown.
     Suggestions appear only when the input is off by exactly ONE letter
     (substitution, insertion, deletion or adjacent swap); anything
     further off is treated as a non-existent city. */
  var CITY_LIST = [
    { name: "Beijing", zh: ["北京"] }, { name: "Shanghai", zh: ["上海"] },
    { name: "Guangzhou", zh: ["广州"] }, { name: "Shenzhen", zh: ["深圳"] },
    { name: "Suzhou", zh: ["苏州", "宿州"] }, { name: "Hangzhou", zh: ["杭州"] },
    { name: "Nanjing", zh: ["南京"] }, { name: "Chengdu", zh: ["成都"] },
    { name: "Chongqing", zh: ["重庆"] }, { name: "Wuhan", zh: ["武汉"] },
    { name: "Xian", zh: ["西安"] }, { name: "Tianjin", zh: ["天津"] },
    { name: "Qingdao", zh: ["青岛"] }, { name: "Xiamen", zh: ["厦门"] },
    { name: "Kunming", zh: ["昆明"] }, { name: "Dalian", zh: ["大连"] },
    { name: "Changsha", zh: ["长沙"] }, { name: "Hefei", zh: ["合肥"] },
    { name: "Fuzhou", zh: ["福州"] }, { name: "Jinan", zh: ["济南"] },
    { name: "Zhengzhou", zh: ["郑州"] }, { name: "Shenyang", zh: ["沈阳"] },
    { name: "Harbin", zh: ["哈尔滨"] }, { name: "Ningbo", zh: ["宁波"] },
    { name: "Wuxi", zh: ["无锡"] }, { name: "Dongguan", zh: ["东莞"] },
    { name: "Foshan", zh: ["佛山"] }, { name: "Hong Kong", zh: ["香港"] },
    { name: "Macau", zh: ["澳门"] }, { name: "Taipei", zh: ["台北"] },
    { name: "Urumqi", zh: ["乌鲁木齐"] }, { name: "Lhasa", zh: ["拉萨"] },
    { name: "Lanzhou", zh: ["兰州"] }, { name: "Guiyang", zh: ["贵阳"] },
    { name: "Nanning", zh: ["南宁"] }, { name: "Haikou", zh: ["海口"] },
    { name: "Sanya", zh: ["三亚"] }, { name: "Guilin", zh: ["桂林"] },
    { name: "Lijiang", zh: ["丽江"] }, { name: "Zhuhai", zh: ["珠海"] },
    { name: "Tokyo", zh: ["东京"] }, { name: "Osaka", zh: ["大阪"] },
    { name: "Seoul", zh: ["首尔"] }, { name: "Singapore", zh: ["新加坡"] },
    { name: "Bangkok", zh: ["曼谷"] }, { name: "London", zh: ["伦敦"] },
    { name: "Paris", zh: ["巴黎"] }, { name: "Berlin", zh: ["柏林"] },
    { name: "Madrid", zh: ["马德里"] }, { name: "Rome", zh: ["罗马"] },
    { name: "Amsterdam", zh: ["阿姆斯特丹"] }, { name: "Vienna", zh: ["维也纳"] },
    { name: "Zurich", zh: ["苏黎世"] }, { name: "Moscow", zh: ["莫斯科"] },
    { name: "New York", zh: ["纽约"] }, { name: "Los Angeles", zh: ["洛杉矶"] },
    { name: "San Francisco", zh: ["旧金山"] }, { name: "Chicago", zh: ["芝加哥"] },
    { name: "Boston", zh: ["波士顿"] }, { name: "Seattle", zh: ["西雅图"] },
    { name: "Toronto", zh: ["多伦多"] }, { name: "Vancouver", zh: ["温哥华"] },
    { name: "Sydney", zh: ["悉尼"] }, { name: "Melbourne", zh: ["墨尔本"] },
    { name: "Auckland", zh: ["奥克兰"] }, { name: "Dubai", zh: ["迪拜"] }
  ];

  /* Optimal string alignment distance: like Levenshtein, but a swap of
     two neighbouring letters also counts as a single typo. */
  function typoDistance(a, b) {
    var m = a.length, n = b.length;
    var d = [], i, j, cost;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + cost
        );
        if (
          i > 1 && j > 1 &&
          a.charAt(i - 1) === b.charAt(j - 2) &&
          a.charAt(i - 2) === b.charAt(j - 1)
        ) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }

  /* Cities exactly one letter away from what the user typed */
  function getSuggestions(input) {
    var q = input.toLowerCase();
    return CITY_LIST.filter(function (entry) {
      return typoDistance(q, entry.name.toLowerCase()) === 1;
    })
      .slice(0, 3)
      .map(function (entry) { return entry.name; });
  }

  /* ---------- response validation ---------- */
  function normName(s) { return String(s).trim().toLowerCase(); }
  function normZh(s) { return String(s).trim().replace(/市$/, ""); }

  /* Known cities the user plausibly meant: same name, a one-letter typo,
     or an exact Chinese alias (e.g. typing 苏州 directly) */
  function getCandidates(input) {
    var q = normName(input);
    var qz = normZh(input);
    return CITY_LIST.filter(function (entry) {
      if (typoDistance(q, normName(entry.name)) <= 1) return true;
      return entry.zh.some(function (z) { return normZh(z) === qz; });
    });
  }

  function entryMatches(entry, returned) {
    var rLower = normName(returned);
    var rZh = normZh(returned);
    if (normName(entry.name) === rLower) return true;
    return entry.zh.some(function (z) { return normZh(z) === rZh; });
  }

  /* True only if the API's answer plausibly belongs to the typed city */
  function cityMatches(input, returned) {
    var candidates = getCandidates(input);
    var i;
    if (candidates.length) {
      for (i = 0; i < candidates.length; i++) {
        if (entryMatches(candidates[i], returned)) return true;
      }
      return false;
    }
    /* City is not in our list — only trust the API when the returned
       name looks like what was typed (e.g. Lyon -> "Lyon") */
    var q = normName(input);
    var r = normName(returned);
    return r === q || r.indexOf(q) === 0 || q.indexOf(r) === 0;
  }

  function hideSuggest() {
    if (suggestEl) suggestEl.classList.add("is-hidden");
    if (chipsEl) chipsEl.innerHTML = "";
  }

  function showNotFound(city) {
    if (!suggestEl || !chipsEl) {
      showNote(MSG_NOT_FOUND, true);
      return;
    }

    var suggestions = getSuggestions(city);
    if (!suggestions.length) {
      // More than one letter off — the city simply doesn't exist
      showNote(MSG_DOESNT_EXIST, true);
      hideSuggest();
      return;
    }

    // Exactly one letter off — ask if they meant one of these
    showNote(MSG_NOT_FOUND, true);
    chipsEl.innerHTML = "";
    suggestions.forEach(function (name) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "weather-chip";
      chip.textContent = name;
      chip.addEventListener("click", function () {
        inputEl.value = name;
        if (formEl.requestSubmit) {
          formEl.requestSubmit();
        } else {
          formEl.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      });
      chipsEl.appendChild(chip);
    });
    suggestEl.classList.remove("is-hidden");
  }

  /* ---------- status message ---------- */
  function showNote(message, isError) {
    if (!noteEl) return;
    noteEl.textContent = message;
    noteEl.classList.toggle("is-error", !!isError);
    noteEl.classList.remove("is-hidden");
  }

  function hideNote() {
    if (noteEl) noteEl.classList.add("is-hidden");
  }

  /* ---------- render ---------- */
  function renderWeather(data) {
    var key = iconKey(data.weather_icon);

    iconEl.innerHTML = ICONS[key] || ICONS.cloudy;
    cityEl.textContent = data.city;
    tempEl.textContent = toUnit(data.temperature);
    condEl.textContent = data.weather;

    hideNote();
    resultEl.classList.remove("is-hidden");

    // Extra modules (high/low, precipitation, air quality, 24h chart)
    loadExtended(data);
    // loadExtended → resetDetail clears lastUapi, so set it after the call
    lastUapi = data;
  }

  /* ============================================================
     Extended modules — Open-Meteo (keyless, CORS enabled)
     UAPI gives current conditions; high/low, precipitation, air
     quality and the 24-hour series are fetched from Open-Meteo,
     located with the city name UAPI itself returned.
     ============================================================ */
  var GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
  var FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  var AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

  var detailEl = document.getElementById("weather-detail");
  var detailNoteEl = document.getElementById("weather-detail-note");
  var chartEl = document.getElementById("weather-chart");
  var statTiles = {
    current: document.getElementById("tile-current"),
    high: document.getElementById("tile-high"),
    low: document.getElementById("tile-low"),
    precip: document.getElementById("tile-precip"),
    humidity: document.getElementById("tile-humidity"),
    air: document.getElementById("tile-air")
  };
  var statCurrentEl = document.getElementById("stat-current");
  var statHighEl = document.getElementById("stat-high");
  var statLowEl = document.getElementById("stat-low");
  var statPrecipEl = document.getElementById("stat-precip");
  var statHumidityEl = document.getElementById("stat-humidity");
  var statAqiEl = document.getElementById("stat-aqi");
  var aqiBadgeEl = document.getElementById("stat-aqi-badge");
  var unitToggleEl = document.getElementById("weather-unit-toggle");
  var unitLabelEl = document.getElementById("weather-unit-label");
  var forecastEl = document.getElementById("weather-forecast");

  /* ---------- °C / °F unit toggle ----------
     All API data stays in Celsius; conversion happens only at render
     time so toggling never needs a refetch. */
  var unit = "C";
  var lastUapi = null;
  var lastData = null;

  function toUnit(celsius) {
    var n = Number(celsius);
    if (isNaN(n)) return celsius;
    return unit === "F" ? Math.round(n * 9 / 5 + 32) : Math.round(n);
  }

  function unitText() { return unit === "F" ? "°F" : "°C"; }

  function updateUnitLabels() {
    if (unitLabelEl) unitLabelEl.textContent = unitText();
    var smalls = document.querySelectorAll("#weather-detail .temp-unit");
    for (var i = 0; i < smalls.length; i++) smalls[i].textContent = unitText();
  }

  if (unitToggleEl) {
    unitToggleEl.addEventListener("click", function (event) {
      var btn = event.target.closest(".unit-btn");
      if (!btn || btn.getAttribute("data-unit") === unit) return;
      unit = btn.getAttribute("data-unit");
      var btns = unitToggleEl.querySelectorAll(".unit-btn");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("is-active", btns[i] === btn);
      }
      updateUnitLabels();
      if (lastUapi) tempEl.textContent = toUnit(lastUapi.temperature);
      if (lastData) renderDetailContent(lastData);
    });
  }

  // Bumped on every new search so late responses can't overwrite new ones
  var extRequestId = 0;

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function resetDetail() {
    extRequestId++;
    lastUapi = null;
    lastData = null;
    if (detailEl) detailEl.classList.add("is-hidden");
    if (detailNoteEl) {
      detailNoteEl.textContent = "";
      detailNoteEl.classList.remove("is-error");
      detailNoteEl.classList.add("is-hidden");
    }
    if (chartEl) chartEl.innerHTML = "";
    if (forecastEl) forecastEl.innerHTML = "";
    Object.keys(statTiles).forEach(function (k) {
      if (statTiles[k]) statTiles[k].classList.remove("is-hidden");
    });
  }

  function showDetailNote(message) {
    if (!detailNoteEl) return;
    detailNoteEl.textContent = message;
    detailNoteEl.classList.remove("is-hidden");
  }

  /* US EPA AQI bands */
  function aqiInfo(aqi) {
    var bands = [
      [0, "Good", "#3faf6c"],
      [51, "Moderate", "#d9a01f"],
      [101, "Unhealthy for sensitive groups", "#e6823e"],
      [151, "Unhealthy", "#d94f4f"],
      [201, "Very unhealthy", "#9b59b6"],
      [301, "Hazardous", "#7d2e4f"]
    ];
    var band = bands[0];
    for (var i = 0; i < bands.length; i++) {
      if (aqi >= bands[i][0]) band = bands[i];
    }
    return { label: band[1], color: band[2] };
  }

  /* The 24 hourly points starting at the current hour */
  function next24Hours(hourly) {
    var now = new Date();
    var key =
      now.getFullYear() + "-" + pad2(now.getMonth() + 1) + "-" +
      pad2(now.getDate()) + "T" + pad2(now.getHours()) + ":00";
    var idx = -1, i;
    for (i = 0; i < hourly.time.length; i++) {
      if (hourly.time[i] === key || hourly.time[i] > key) { idx = i; break; }
    }
    if (idx < 0) idx = 0;

    var out = [];
    for (i = 0; i < 24 && hourly.time[idx + i]; i++) {
      out.push({
        label: i === 0 ? "Now" : hourly.time[idx + i].slice(11, 16),
        temp: hourly.temperature_2m[idx + i],
        precip: hourly.precipitation[idx + i]
      });
    }
    return out;
  }

  /* Inline SVG dual-line chart: temperature (pink, left axis) and
     precipitation (blue, right axis) over the next 24 hours */
  function buildHourlyChart(hours) {
    var W = 720, H = 300;
    var mL = 40, mR = 40, mT = 26, mB = 38;
    var plotW = W - mL - mR;
    var plotH = H - mT - mB;
    var n = hours.length;
    var stepX = plotW / (n - 1);

    var tMin = Math.min.apply(null, hours.map(function (h) { return h.temp; }));
    var tMax = Math.max.apply(null, hours.map(function (h) { return h.temp; }));
    var tRange = tMax - tMin || 1;
    var tLo = Math.floor(tMin - Math.max(1.5, tRange * 0.2));
    var tHi = Math.ceil(tMax + Math.max(1.5, tRange * 0.2));
    var pMax = Math.max(1, Math.max.apply(null, hours.map(function (h) { return h.precip; })));

    function x(i) { return mL + i * stepX; }
    function yT(v) { return mT + plotH * (tHi - v) / (tHi - tLo); }
    function yP(v) { return mT + plotH - plotH * (v / pMax); }

    var svg = [];
    svg.push(
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" ' +
      'role="img" aria-label="Temperature and precipitation for the next 24 hours">'
    );
    svg.push(
      '<defs><linearGradient id="wTempFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#e0578f" stop-opacity="0.22"/>' +
      '<stop offset="100%" stop-color="#e0578f" stop-opacity="0"/></linearGradient></defs>'
    );

    // Horizontal grid lines + left temperature scale
    var k, gv, gy;
    for (k = 0; k <= 4; k++) {
      gv = tLo + (tHi - tLo) * k / 4;
      gy = mT + plotH - plotH * k / 4;
      svg.push('<line x1="' + mL + '" y1="' + gy + '" x2="' + (W - mR) +
        '" y2="' + gy + '" stroke="#efdce6" stroke-width="1"/>');
      svg.push('<text x="' + (mL - 8) + '" y="' + (gy + 4) +
        '" text-anchor="end" font-size="11" fill="#8a6b85">' + Math.round(gv) + "°</text>");
    }
    // Right precipitation scale (top / bottom)
    svg.push('<text x="' + (W - mR + 8) + '" y="' + (mT + 4) +
      '" text-anchor="start" font-size="11" fill="#5aa9e6">' + (pMax >= 10 ? Math.round(pMax) : pMax.toFixed(1)) + " mm</text>");
    svg.push('<text x="' + (W - mR + 8) + '" y="' + (mT + plotH + 4) +
      '" text-anchor="start" font-size="11" fill="#5aa9e6">0 mm</text>');

    // Temperature area + line
    var line = hours.map(function (h, i) {
      return (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + yT(h.temp).toFixed(1);
    }).join(" ");
    svg.push('<path d="' + line + " L" + x(n - 1).toFixed(1) + " " + (mT + plotH) +
      " L" + x(0).toFixed(1) + " " + (mT + plotH) + 'Z" fill="url(#wTempFill)"/>');
    svg.push('<path d="' + line + '" fill="none" stroke="#e0578f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>');

    // Precipitation line
    var pline = hours.map(function (h, i) {
      return (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + yP(h.precip).toFixed(1);
    }).join(" ");
    svg.push('<path d="' + pline + '" fill="none" stroke="#5aa9e6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');

    // Points, value labels (every 3 h) and x labels (every 3 h)
    hours.forEach(function (h, i) {
      var tx = x(i).toFixed(1);
      var every3 = i % 3 === 0;

      svg.push('<circle cx="' + tx + '" cy="' + yT(h.temp).toFixed(1) +
        '" r="3" fill="#fff" stroke="#e0578f" stroke-width="2"><title>' +
        h.label + " · " + Math.round(h.temp) + "°C · " + h.precip + " mm</title></circle>");
      svg.push('<circle cx="' + tx + '" cy="' + yP(h.precip).toFixed(1) +
        '" r="2.5" fill="#5aa9e6"/>');

      if (every3) {
        svg.push('<text x="' + tx + '" y="' + (yT(h.temp) - 9).toFixed(1) +
          '" text-anchor="middle" font-size="11" font-weight="700" fill="#b84470">' +
          Math.round(h.temp) + "°</text>");
        svg.push('<text x="' + tx + '" y="' + (mT + plotH + 20) +
          '" text-anchor="middle" font-size="11" fill="#8a6b85">' + h.label + "</text>");
      }
    });

    svg.push("</svg>");
    return svg.join("");
  }

  function setTile(tileEl, valueEl, value, suffix) {
    if (value === undefined || value === null || isNaN(value)) {
      if (tileEl) tileEl.classList.add("is-hidden");
      return;
    }
    valueEl.textContent = value + (suffix || "");
  }

  /* WMO weather codes (Open-Meteo daily) -> our icon keys */
  function wmoIconKey(code) {
    if (code === 0 || code === 1) return "clear";
    if (code === 2 || code === 3) return "cloudy";
    if (code === 45 || code === 48) return "fog";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    return "rain"; // drizzle, rain, showers, thunderstorms
  }

  /* 3-day forecast cards (tomorrow + the two days after) */
  function renderForecast(daily) {
    if (!forecastEl) return;
    forecastEl.innerHTML = "";
    if (!daily || !daily.time || daily.time.length < 2) return;

    var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (var i = 1; i <= 3 && i < daily.time.length; i++) {
      var day = new Date(daily.time[i] + "T00:00:00");
      var key = wmoIconKey(daily.weathercode[i]);

      var card = document.createElement("div");
      card.className = "weather-forecast-card";
      card.innerHTML =
        '<span class="forecast-day">' + DAYS[day.getDay()] + "</span>" +
        '<span class="forecast-icon">' + (ICONS[key] || ICONS.cloudy) + "</span>" +
        '<span class="forecast-temps"><strong>' +
          toUnit(daily.temperature_2m_max[i]) + "°</strong> / " +
          toUnit(daily.temperature_2m_min[i]) + "°</span>";
      forecastEl.appendChild(card);
    }
  }

  /* Renders tiles + AQI + forecast + chart from a stored payload —
     called on first load and again whenever the unit is toggled */
  function renderDetailContent(stored) {
    var uapi = stored.uapi;
    var forecast = stored.forecast;
    var air = stored.air;

    setTile(statTiles.current, statCurrentEl,
      uapi.temperature === undefined || uapi.temperature === null ? null : toUnit(uapi.temperature), "");
    setTile(statTiles.high, statHighEl,
      forecast.daily ? toUnit(forecast.daily.temperature_2m_max[0]) : null, "");
    setTile(statTiles.low, statLowEl,
      forecast.daily ? toUnit(forecast.daily.temperature_2m_min[0]) : null, "");
    setTile(statTiles.precip, statPrecipEl,
      forecast.daily ? Math.round(forecast.daily.precipitation_sum[0] * 10) / 10 : null, "");

    var humidity =
      uapi.humidity !== undefined && uapi.humidity !== null
        ? Math.round(uapi.humidity)
        : forecast.current && forecast.current.relative_humidity_2m !== undefined
          ? forecast.current.relative_humidity_2m
          : null;
    setTile(statTiles.humidity, statHumidityEl, humidity, "");

    var aqi = air.current && air.current.us_aqi !== undefined ? Math.round(air.current.us_aqi) : null;
    if (aqi === null) {
      statTiles.air.classList.add("is-hidden");
    } else {
      var info = aqiInfo(aqi);
      statAqiEl.textContent = aqi;
      aqiBadgeEl.textContent = info.label;
      aqiBadgeEl.style.background = info.color;
      aqiBadgeEl.title = "US EPA Air Quality Index: " + info.label;
    }

    renderForecast(forecast.daily);

    if (forecast.hourly) {
      // Chart works in the active unit; precipitation stays in mm
      var hours = next24Hours(forecast.hourly).map(function (h) {
        return {
          label: h.label,
          temp: unit === "F" ? h.temp * 9 / 5 + 32 : h.temp,
          precip: h.precip
        };
      });
      chartEl.innerHTML = buildHourlyChart(hours);
    }

    updateUnitLabels();
  }

  function renderDetail(uapi, forecast, air, requestId) {
    if (requestId !== extRequestId) return;
    lastData = { uapi: uapi, forecast: forecast, air: air };
    renderDetailContent(lastData);
    detailNoteEl.classList.add("is-hidden");
    detailEl.classList.remove("is-hidden");
  }

  /* ============================================================
     City autocomplete — Open-Meteo geocoding
     As the user types, matching cities are listed. Cities that
     share a name are separated by their state/province and
     country (e.g. Springfield, Illinois, United States).
     ============================================================ */
  var acEl = document.getElementById("weather-ac-list");
  var acItems = [];
  var acIndex = -1;
  var acRequestId = 0;
  var acTimer = null;

  function hideAc() {
    if (!acEl) return;
    acEl.classList.add("is-hidden");
    acEl.innerHTML = "";
    acItems = [];
    acIndex = -1;
    inputEl.setAttribute("aria-expanded", "false");
  }

  /* Label shown under the city name. Open-Meteo omits admin1 for some
     places, so fall back to whatever geography it does provide. */
  function acRegion(item) {
    return [item.admin1, item.country].filter(Boolean).join(", ");
  }

  /* Region is only worth showing when the name is ambiguous —
     one match for the city name needs no disambiguation. */
  function acLabel(item, duplicateNames) {
    var region = acRegion(item);
    if (!duplicateNames[item.name]) return item.country || "";
    return region || item.country || "";
  }

  /* Open-Meteo occasionally returns the same city twice under different
     ids. Collapse exact duplicates so the list doesn't repeat a row. */
  function dedupe(items) {
    var seen = {};
    var out = [];
    items.forEach(function (item) {
      var key = item.name + "|" + (item.admin1 || "") + "|" + (item.country || "");
      if (seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    return out;
  }

  function acSelect(item) {
    // UAPI matches Chinese city names exactly ("苏州" -> 苏州市) but
    // fuzzy-matches English ones, where "Suzhou" wrongly resolves to
    // 宿州市. Send the Chinese name for Chinese cities.
    inputEl.value = item.query || item.name;
    hideAc();
    hideNote();
    if (formEl.requestSubmit) {
      formEl.requestSubmit();
    } else {
      formEl.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }

  function acHighlight(el) {
    for (var i = 0; i < acItems.length; i++) {
      var on = i === acIndex;
      acItems[i].classList.toggle("is-active", on);
      if (on) acItems[i].scrollIntoView({ block: "nearest" });
    }
  }

  function acRender(items, query) {
    if (!acEl) return;
    acEl.innerHTML = "";
    acItems = [];
    acIndex = -1;

    // Count how often each name appears so only ambiguous ones show a region
    var counts = {};
    items.forEach(function (item) {
      counts[item.name] = (counts[item.name] || 0) + 1;
    });

    var q = query.toLowerCase();

    items.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "weather-ac-item";
      li.setAttribute("role", "option");

      var name = document.createElement("span");
      name.className = "weather-ac-name";
      // Highlight the typed prefix inside the city name
      var pos = item.name.toLowerCase().indexOf(q);
      if (pos > 0) {
        name.appendChild(document.createTextNode(item.name.slice(0, pos)));
        var hl = document.createElement("span");
        hl.className = "weather-ac-hl";
        hl.textContent = item.name.substr(pos, q.length);
        name.appendChild(hl);
        name.appendChild(document.createTextNode(item.name.slice(pos + q.length)));
      } else {
        name.textContent = item.name;
      }
      li.appendChild(name);

      var label = acLabel(item, counts);
      if (label) {
        var meta = document.createElement("span");
        meta.className = "weather-ac-meta";
        meta.textContent = label;
        li.appendChild(meta);
      } else if (counts[item.name] > 1) {
        // Duplicated name with no geography at all — say so rather than
        // leaving rows that look identical
        var unknown = document.createElement("span");
        unknown.className = "weather-ac-meta";
        unknown.textContent = "Location unavailable";
        li.appendChild(unknown);
      }

      li.addEventListener("mousedown", function (event) {
        event.preventDefault(); // don't blur the input before we read the value
        acSelect(item);
      });
      acEl.appendChild(li);
      acItems.push(li);
    });

    if (!items.length) {
      var none = document.createElement("li");
      none.className = "weather-ac-status";
      none.textContent = "No matching cities";
      acEl.appendChild(none);
    }

    acEl.classList.remove("is-hidden");
    inputEl.setAttribute("aria-expanded", "true");
  }

  /* Geocoding matches on a substring anywhere in the name, so "bost" would
     otherwise surface "Bost Airfield" and "Bosta". Prefer names that start
     with the query; otherwise keep only real places, not airfields,
     stations and other incidental features. */
  function isRealCity(item) {
    return String(item.feature_code || "").slice(0, 2) === "PP";
  }

  function filterByPrefix(items, query) {
    var q = query.toLowerCase().trim();
    if (!q) return [];
    var pool = dedupe(items.filter(isRealCity));
    // Every result filtered out (e.g. only airfields matched) — keep them all
    if (!pool.length) pool = dedupe(items);

    var starts = pool.filter(function (item) {
      return item.name.toLowerCase().indexOf(q) === 0;
    });
    if (starts.length) return starts;
    // Nothing starts with it — fall back to word-boundary matches so
    // "san fr" still finds "San Francisco"
    return pool.filter(function (item) {
      var n = item.name.toLowerCase();
      return n.indexOf(" " + q) > -1 || n.indexOf(q + " ") > -1;
    });
  }

  function acSearch(rawQuery) {
    var query = rawQuery.trim();
    if (query.length < 2) {
      hideAc();
      return;
    }

    var requestId = ++acRequestId;
    var isChineseInput = /[\u4e00-\u9fa5]/.test(query);

    function geo(lang) {
      return fetch(
        GEO_URL + "?name=" + encodeURIComponent(query) +
        "&count=12&language=" + lang + "&format=json"
      )
        .then(function (res) {
          if (!res.ok) throw new Error("ac " + res.status);
          return res.json();
        })
        .then(function (data) {
          return (data && data.results) || [];
        });
    }

    // Ask for both languages and pair them by geo id: the English name
    // drives the display, the Chinese name is what UAPI resolves exactly.
    Promise.all([geo(isChineseInput ? "zh" : "en"), geo(isChineseInput ? "en" : "zh")])
      .then(function (both) {
        // A newer keystroke already replaced this request
        if (requestId !== acRequestId) return;

        var primary = both[0];
        var secondary = both[1];
        var byId = {};
        secondary.forEach(function (item) { byId[item.id] = item; });

        var merged = primary.map(function (item) {
          var alt = byId[item.id];
          // Strip the 市 suffix UAPI adds back on its own
          var zh = alt && /[\u4e00-\u9fa5]/.test(alt.name)
            ? alt.name.replace(/市$/, "")
            : "";
          var copy = {};
          for (var k in item) copy[k] = item[k];
          if (zh) copy.query = zh;

          // Cache both spellings — loadExtended needs the romanized one
          // when Open-Meteo can't match the Chinese literal.
          if (zh) {
            rememberGeoName(zh, item.name);
          } else if (/[\u4e00-\u9fa5]/.test(item.name)) {
            var enAlt = alt && !/[\u4e00-\u9fa5]/.test(alt.name) ? alt.name : "";
            if (enAlt) rememberGeoName(item.name.replace(/市$/, ""), enAlt);
          }
          return copy;
        });

        var items = filterByPrefix(merged, query);
        acRender(items, query);
      })
      .catch(function () {
        if (requestId === acRequestId) hideAc();
      });
  }

  if (inputEl && acEl) {
    inputEl.addEventListener("input", function () {
      var value = inputEl.value;
      // Debounce so each keystroke doesn't fire its own lookup
      if (acTimer) clearTimeout(acTimer);
      acTimer = setTimeout(function () {
        acSearch(value);
      }, 220);
    });

    // Arrow keys + Enter navigate the list; Escape closes it
    inputEl.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        hideAc();
        return;
      }
      if (!acItems.length) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        acIndex = event.key === "ArrowDown"
          ? (acIndex + 1) % acItems.length
          : (acIndex - 1 + acItems.length) % acItems.length;
        acHighlight();
      } else if (event.key === "Enter" && acIndex > -1) {
        event.preventDefault();
        var chosen = acItems[acIndex];
        if (chosen) chosen.dispatchEvent(new MouseEvent("mousedown", { cancelable: true }));
      }
    });

    inputEl.addEventListener("blur", function () {
      // Let a click on an item land before the list disappears
      setTimeout(hideAc, 120);
    });

    formEl.addEventListener("submit", hideAc);
  }

  /* Open-Meteo's index is keyed on the romanized name, so the literal
     Chinese string can miss a city it clearly knows (宿州 is stored only
     as "Suzhou"). The autocomplete already pairs both spellings by geo
     id, so keep the English name around and reuse it as a fallback. */
  var zhToEnGeo = {};

  /* Cities Open-Meteo can't match by their literal Chinese name —
     verified against the geocoding API. Anything absent here resolves
     normally, so keep this list to the exceptions only. */
  var PINYIN_ALIAS = {
    "宿州": "Suzhou",
    "宣城": "Xuancheng",
    "淮南": "Huainan",
    "扬州": "Yangzhou",
    "泰州": "Taizhou",
    "连云港": "Lianyungang",
    "宿迁": "Suqian",
    "常州": "Changzhou",
    "衢州": "Quzhou",
    "温州": "Wenzhou",
    "湖州": "Huzhou",
    "宜春": "Yichun",
    "抚州": "Fuzhou",
    "景德镇": "Jingdezhen",
    "荆州": "Jingzhou",
    "荆门": "Jingmen",
    "咸宁": "Xianning",
    "遵义": "Zunyi",
    "曲靖": "Qujing",
    "汉中": "Hanzhong",
    "个旧": "Gejiu",
    "通辽": "Tongliao",
    "抚顺": "Fushun",
    "锦州": "Jinzhou",
    "运城": "Yuncheng"
  };

  function rememberGeoName(zhName, enName) {
    if (!zhName || !enName) return;
    var key = String(zhName).replace(/市$/, "");
    zhToEnGeo[key] = String(enName);
  }

  function geocode(query, lang, count) {
    return fetch(
      GEO_URL + "?name=" + encodeURIComponent(query) +
      "&count=" + (count || 1) + "&language=" + lang + "&format=json"
    ).then(function (res) {
      if (!res.ok) throw new Error("geo " + res.status);
      return res.json();
    });
  }

  /* Resolve a UAPI city name to coordinates. Tries the literal name in
     Chinese, then the romanized name (either remembered from the
     autocomplete or listed in PINYIN_ALIAS). */
  function resolveLoc(uapi) {
    var city = String(uapi.city || "").replace(/[省市区县]+$/, "").trim();
    var province = String(uapi.province || "").replace(/[省市区县]+$/, "").trim();

    function firstOf(geo) {
      return geo && geo.results && geo.results.length ? geo.results[0] : null;
    }

    return geocode(city, "zh")
      .then(function (geo) {
        return firstOf(geo);
      })
      .catch(function () { return null; })
      .then(function (hit) {
        if (hit) return hit;

        // Chinese literal missed — retry under the romanized name
        var en = zhToEnGeo[city] || PINYIN_ALIAS[city];
        if (!en) return null;

        // Several romanized names are shared across provinces
        // ("Suzhou" exists in Anhui and Jiangsu), so pull the full
        // list and pick the entry UAPI's province points at. Ask in
        // Chinese so admin1 comes back as "安徽" and lines up with
        // the province UAPI reported.
        return geocode(en, "zh", 20)
          .then(function (geo) {
            var results = (geo && geo.results) || [];
            if (!results.length || !province) return results[0] || null;
            var norm = function (s) {
              return String(s || "").toLowerCase().replace(/[^a-z\u4e00-\u9fa5]/g, "");
            };
            var target = norm(province);
            for (var i = 0; i < results.length; i++) {
              var admin = norm(results[i].admin1);
              if (!admin) continue;
              if (admin === target || admin.indexOf(target) > -1 || target.indexOf(admin) > -1) {
                return results[i];
              }
            }
            return results[0];
          })
          .catch(function () { return null; });
      });
  }

  function loadExtended(uapi) {
    resetDetail();
    var requestId = extRequestId;
    showDetailNote("Loading detailed forecast\u2026");

    resolveLoc(uapi)
      .then(function (loc) {
        if (requestId !== extRequestId) return null;
        if (!loc) throw new Error("no-geo");

        var forecastReq = fetch(
          FORECAST_URL +
            "?latitude=" + loc.latitude +
            "&longitude=" + loc.longitude +
            "&current=temperature_2m,relative_humidity_2m,precipitation" +
            "&hourly=temperature_2m,precipitation" +
            "&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum" +
            "&timezone=auto&forecast_days=4"
        ).then(function (r) {
          if (!r.ok) throw new Error("forecast " + r.status);
          return r.json();
        });

        var airReq = fetch(
          AIR_URL +
            "?latitude=" + loc.latitude +
            "&longitude=" + loc.longitude +
            "&current=us_aqi,pm2_5&timezone=auto"
        ).then(function (r) {
          if (!r.ok) throw new Error("air " + r.status);
          return r.json();
        }).catch(function () { return { current: {} }; }); // AQI is optional

        return Promise.all([forecastReq, airReq]).then(function (results) {
          if (requestId !== extRequestId) return;
          renderDetail(uapi, results[0], results[1], requestId);
        });
      })
      .catch(function (err) {
        if (requestId !== extRequestId) return;
        console.warn("Extended forecast unavailable:", err.message);
        if (detailEl) detailEl.classList.add("is-hidden");
        showDetailNote("Detailed forecast isn\u2019t available for this city.");
      });
  }

  /* ---------- search ---------- */
  formEl.addEventListener("submit", function (event) {
    event.preventDefault();

    var city = inputEl.value.trim();
    resultEl.classList.add("is-hidden");
    hideSuggest();
    resetDetail();

    // Empty box — tell the user, and make no API call
    if (!city) {
      showNote(MSG_EMPTY, true);
      inputEl.focus();
      return;
    }

    searchBtn.disabled = true;
    showNote(MSG_LOADING, false);

    fetch(API_URL + "?city=" + encodeURIComponent(city))
      .then(function (res) {
        if (!res.ok) {
          var err = new Error("HTTP " + res.status);
          err.status = res.status;
          throw err;
        }
        return res.json();
      })
      .then(function (data) {
        // No usable result for that city
        if (
          !data ||
          !data.city ||
          !data.weather ||
          data.temperature === undefined ||
          data.temperature === null
        ) {
          showNotFound(city);
          return;
        }
        // The API fuzzy-matches on its own and may answer with an
        // unrelated city (e.g. "shangai" -> 太原) — reject those
        if (!cityMatches(city, data.city)) {
          console.warn("Weather: API returned unrelated city", data.city, "for", city);
          showNotFound(city);
          return;
        }
        renderWeather(data);
      })
      .catch(function (err) {
        // A 4xx from the API means the city wasn't recognised — not a real error
        if (err && err.status) {
          console.warn("Weather: no city matched", err.message);
          showNotFound(city);
        } else {
          console.error("Weather lookup failed:", err);
          showNote(MSG_OFFLINE, true);
        }
      })
      .finally(function () {
        searchBtn.disabled = false;
      });
  });
})();
