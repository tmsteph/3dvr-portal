#include <gtk/gtk.h>
#include <gdk/gdkx.h>
#include <X11/Xatom.h>
#include <X11/Xutil.h>
#include <X11/extensions/shape.h>
#include <time.h>
#include <stdlib.h>
#include <string.h>

static GtkWidget *home_window;
static GtkWidget *clock_label;
static GtkWidget *input_button;
static GtkWidget *spinner_label;
static Window last_client_window = 0;
static const int BAR_HEIGHT = 120;
static const int SPIN_SELECT_DISTANCE = 44;

typedef struct {
  gboolean active;
  double start_x;
  double start_y;
  const char *selection;
  GdkSeat *seat;
} SpinnerGesture;
static SpinnerGesture spin = {0};
static GtkWidget *search_entry;
static GtkWidget *running_box;
static GtkWidget *app_tiles[8];

typedef struct {
  const char *label;
  const char *icon;
  const char *command;
  const char *match;
  const char *process;
  const char *keywords;
} App;

static const App apps[] = {
  {"Firefox", "firefox", "/data/data/com.termux/files/home/bin/firefox-touch", "firefox", "firefox", "web browser internet"},
  {"Chromium", "chromium", "/data/data/com.termux/files/home/bin/chromium-touch", "chromium", "chromium", "web browser chrome internet"},
  {"Terminal", "utilities-terminal", "/data/data/com.termux/files/home/bin/phone-terminal", "xfce4-terminal", "xfce4-terminal", "shell command line termux"},
  {"Files", "system-file-manager", "/data/data/com.termux/files/home/bin/phone-files", "thunar", "thunar", "files folders storage"},
  {"3DVR", "applications-development", "/data/data/com.termux/files/home/bin/phone-3dvr", "3dvr", "/scripts/3dvr", "agent operator cockpit"},
  {"Settings", "preferences-system", "/data/data/com.termux/files/home/bin/phone-settings", "settings", "xfce4-settings", "preferences display system"},
};

static void run_async(const char *command) {
  GError *error = NULL;
  g_spawn_command_line_async(command, &error);
  if (error) {
    g_warning("%s", error->message);
    g_error_free(error);
  }
}

static gboolean window_is_shell(Display *dpy, Window w) {
  XClassHint hint = {0};
  if (!XGetClassHint(dpy, w, &hint)) return FALSE;
  gboolean shell = (hint.res_name && strstr(hint.res_name, "3dvr-shell")) ||
                   (hint.res_class && strstr(hint.res_class, "3dvr-shell"));
  if (hint.res_name) XFree(hint.res_name);
  if (hint.res_class) XFree(hint.res_class);
  return shell;
}

static gboolean window_is_client(Display *dpy, Window w) {
  if (!w || window_is_shell(dpy, w)) return FALSE;
  Atom type_atom = XInternAtom(dpy, "_NET_WM_WINDOW_TYPE", False);
  Atom dock_atom = XInternAtom(dpy, "_NET_WM_WINDOW_TYPE_DOCK", False);
  Atom desktop_atom = XInternAtom(dpy, "_NET_WM_WINDOW_TYPE_DESKTOP", False);
  Atom actual = None; int format = 0; unsigned long n = 0, extra = 0; unsigned char *data = NULL;
  if (XGetWindowProperty(dpy, w, type_atom, 0, 8, False, XA_ATOM,
      &actual, &format, &n, &extra, &data) == Success && data) {
    Atom *types = (Atom *)data;
    for (unsigned long i = 0; i < n; i++) {
      if (types[i] == dock_atom || types[i] == desktop_atom) { XFree(data); return FALSE; }
    }
    XFree(data);
  }
  return TRUE;
}

static gboolean track_active_window(gpointer unused) {
  Display *dpy = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());
  Window root = DefaultRootWindow(dpy);
  Atom a = XInternAtom(dpy, "_NET_ACTIVE_WINDOW", False);
  Atom actual = None; int format = 0; unsigned long n = 0, extra = 0; unsigned char *data = NULL;
  if (XGetWindowProperty(dpy, root, a, 0, 1, False, XA_WINDOW,
      &actual, &format, &n, &extra, &data) == Success && data && n) {
    Window w = *(Window *)data;
    if (window_is_client(dpy, w)) last_client_window = w;
    XFree(data);
  }
  return G_SOURCE_CONTINUE;
}

static void activate_window(Window w) {
  if (!w) return;
  run_async("wmctrl -k off");
  char *cmd = g_strdup_printf("wmctrl -ia 0x%lx", w);
  run_async(cmd); g_free(cmd);
  last_client_window = w;
}

static gboolean window_matches(Display *dpy, Window w, const char *needle) {
  if (!needle || !*needle) return FALSE;
  char *q = g_ascii_strdown(needle, -1);
  gboolean match = FALSE;
  XClassHint hint = {0};
  if (XGetClassHint(dpy, w, &hint)) {
    char *a = hint.res_name ? g_ascii_strdown(hint.res_name, -1) : NULL;
    char *b = hint.res_class ? g_ascii_strdown(hint.res_class, -1) : NULL;
    match = (a && strstr(a, q)) || (b && strstr(b, q));
    g_free(a); g_free(b);
    if (hint.res_name) XFree(hint.res_name);
    if (hint.res_class) XFree(hint.res_class);
  }
  char *title = NULL;
  if (!match && XFetchName(dpy, w, &title) && title) {
    char *t = g_ascii_strdown(title, -1);
    match = strstr(t, q) != NULL;
    g_free(t); XFree(title);
  }
  g_free(q); return match;
}

static gboolean process_running(const App *app) {
  Display *dpy = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());
  Window root = DefaultRootWindow(dpy);
  Atom list = XInternAtom(dpy, "_NET_CLIENT_LIST", False);
  Atom actual = None; int format = 0; unsigned long n = 0, extra = 0; unsigned char *data = NULL;
  if (XGetWindowProperty(dpy, root, list, 0, 256, False, XA_WINDOW,
      &actual, &format, &n, &extra, &data) != Success || !data) return FALSE;
  Window *wins = (Window *)data; gboolean found = FALSE;
  for (unsigned long i = 0; i < n; i++) {
    if (window_is_client(dpy, wins[i]) && window_matches(dpy, wins[i], app->match)) { found = TRUE; break; }
  }
  XFree(data); return found;
}

static gboolean update_clock(gpointer unused) {
  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  char buf[64];
  strftime(buf, sizeof(buf), "%a  %-I:%M %p", t);
  gtk_label_set_text(GTK_LABEL(clock_label), buf);
  return G_SOURCE_CONTINUE;
}

static void focus_app(GtkButton *button, gpointer data) {
  const App *app = data;
  char *cmd = g_strdup_printf(
      "/data/data/com.termux/files/home/bin/3dvr-focus-app '%s'", app->match);
  run_async(cmd);
  g_free(cmd);
}

static void launch_app(GtkButton *button, gpointer data) {
  const App *app = data;
  if (process_running(app)) {
    focus_app(NULL, (gpointer)app);
    return;
  }
  run_async("wmctrl -k off");
  run_async(app->command);
}

static void get_screen_size(int *w, int *h) {
  Display *dpy = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());
  int screen = DefaultScreen(dpy);
  *w = DisplayWidth(dpy, screen);
  *h = DisplayHeight(dpy, screen);
}

static gboolean get_workarea(int *x, int *y, int *w, int *h) {
  Display *dpy = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());
  Window root = DefaultRootWindow(dpy);
  Atom a = XInternAtom(dpy, "_NET_WORKAREA", False);
  Atom actual = None; int format = 0; unsigned long n = 0, extra = 0; unsigned char *data = NULL;
  if (XGetWindowProperty(dpy, root, a, 0, 4, False, XA_CARDINAL,
      &actual, &format, &n, &extra, &data) == Success && data && n >= 4) {
    unsigned long *v = (unsigned long *)data;
    *x = (int)v[0]; *y = (int)v[1]; *w = (int)v[2]; *h = (int)v[3];
    XFree(data); return TRUE;
  }
  if (data) XFree(data);
  int sw = 0, sh = 0;
  get_screen_size(&sw, &sh);
  *x = 0; *y = BAR_HEIGHT; *w = sw; *h = sh - BAR_HEIGHT;
  return FALSE;
}

static GtkWidget *make_icon(const char *name, int size) {
  GtkWidget *image = gtk_image_new_from_icon_name(name, GTK_ICON_SIZE_DIALOG);
  gtk_image_set_pixel_size(GTK_IMAGE(image), size);
  return image;
}
static GtkWidget *make_running_card(const App *app) {
  GtkWidget *button = gtk_button_new();
  GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 12);
  GtkWidget *image = make_icon(app->icon, 82);
  GtkWidget *label = gtk_label_new(app->label);

  gtk_style_context_add_class(gtk_widget_get_style_context(button), "running-card");
  gtk_style_context_add_class(gtk_widget_get_style_context(label), "running-label");
  gtk_widget_set_size_request(button, 230, 160);
  gtk_box_pack_start(GTK_BOX(box), image, TRUE, TRUE, 0);
  gtk_box_pack_start(GTK_BOX(box), label, FALSE, FALSE, 0);
  gtk_container_add(GTK_CONTAINER(button), box);
  g_signal_connect(button, "clicked", G_CALLBACK(focus_app), (gpointer)app);
  return button;
}

static gboolean refresh_running(gpointer unused) {
  GList *children = gtk_container_get_children(GTK_CONTAINER(running_box));
  for (GList *l = children; l; l = l->next) gtk_widget_destroy(GTK_WIDGET(l->data));
  g_list_free(children);

  int count = 0;
  for (guint i = 0; i < G_N_ELEMENTS(apps); i++) {
    if (!process_running(&apps[i])) continue;
    GtkWidget *card = make_running_card(&apps[i]);
    gtk_box_pack_start(GTK_BOX(running_box), card, FALSE, FALSE, 0);
    count++;
  }
  if (!count) {
    GtkWidget *empty = gtk_label_new("Nothing open yet");
    gtk_style_context_add_class(gtk_widget_get_style_context(empty), "empty-running");
    gtk_box_pack_start(GTK_BOX(running_box), empty, FALSE, FALSE, 0);
  }
  gtk_widget_show_all(running_box);
  return G_SOURCE_CONTINUE;
}

static void tile_last_client(const char *where) {
  if (!last_client_window) track_active_window(NULL);
  if (!last_client_window) return;
  int x, y, w, h; get_workarea(&x, &y, &w, &h);
  char *cmd = NULL;
  if (!strcmp(where, "full")) {
    cmd = g_strdup_printf("sh -lc 'wmctrl -k off; wmctrl -ir 0x%lx -b add,maximized_vert,maximized_horz; wmctrl -ia 0x%lx'",
                          last_client_window, last_client_window);
  } else {
    int half = h / 2;
    int ty = !strcmp(where, "bottom") ? y + half : y;
    int th = !strcmp(where, "bottom") ? h - half : half;
    cmd = g_strdup_printf("sh -lc 'wmctrl -k off; wmctrl -ir 0x%lx -b remove,maximized_vert,maximized_horz; wmctrl -ir 0x%lx -e 0,%d,%d,%d,%d; wmctrl -ia 0x%lx'",
                          last_client_window, last_client_window, x, ty, w, th, last_client_window);
  }
  run_async(cmd); g_free(cmd);
}

static void focus_relative(int step) {
  Display *dpy = GDK_DISPLAY_XDISPLAY(gdk_display_get_default());
  Window root = DefaultRootWindow(dpy);
  Atom a = XInternAtom(dpy, "_NET_CLIENT_LIST_STACKING", False);
  Atom actual = None; int format = 0; unsigned long n = 0, extra = 0; unsigned char *data = NULL;
  if (XGetWindowProperty(dpy, root, a, 0, 256, False, XA_WINDOW,
      &actual, &format, &n, &extra, &data) != Success || !data || !n) return;
  Window *wins = (Window *)data;
  long start = step > 0 ? -1 : 0;
  for (unsigned long i = 0; i < n; i++) if (wins[i] == last_client_window) { start = (long)i; break; }
  for (unsigned long off = 1; off <= n; off++) {
    long idx = (start + step * (long)off) % (long)n;
    if (idx < 0) idx += n;
    if (window_is_client(dpy, wins[idx])) { Window target = wins[idx]; XFree(data); activate_window(target); return; }
  }
  XFree(data);
}

static gboolean input_is_direct(void) {
  gchar *text = NULL; gsize len = 0;
  gboolean direct = TRUE;
  if (g_file_get_contents("/data/data/com.termux/files/home/.config/termux-x11/input-mode", &text, &len, NULL)) {
    direct = g_str_has_prefix(text, "direct"); g_free(text);
  }
  return direct;
}

static void sync_input_label(void) {
  if (input_button) gtk_button_set_label(GTK_BUTTON(input_button), input_is_direct() ? "Touch" : "Trackpad");
}

static void toggle_input(GtkButton *button, gpointer unused) {
  if (input_is_direct()) {
    run_async("termux-x11-preference touchMode:Trackpad tapToMove:true");
    g_file_set_contents("/data/data/com.termux/files/home/.config/termux-x11/input-mode", "trackpad", -1, NULL);
  } else {
    run_async("termux-x11-preference \"touchMode:Direct touch\"");
    g_file_set_contents("/data/data/com.termux/files/home/.config/termux-x11/input-mode", "direct", -1, NULL);
  }
  sync_input_label();
}

static const char *spinner_selection(double dx, double dy) {
  double d2 = dx * dx + dy * dy;
  if (d2 < (double)(SPIN_SELECT_DISTANCE * SPIN_SELECT_DISTANCE)) return "";
  double ax = dx < 0 ? -dx : dx;
  double ay = dy < 0 ? -dy : dy;
  if (ax > ay) return dx > 0 ? "next" : "prev";
  return dy > 0 ? "bottom" : "top";
}

static void spinner_set_label(const char *selection) {
  if (!spinner_label) return;
  const char *text = "◎";
  if (selection && !strcmp(selection, "top")) text = "↑ Top";
  else if (selection && !strcmp(selection, "bottom")) text = "↓ Bottom";
  else if (selection && !strcmp(selection, "prev")) text = "← Prev";
  else if (selection && !strcmp(selection, "next")) text = "Next →";
  gtk_label_set_text(GTK_LABEL(spinner_label), text);
}

static gboolean spinner_press(GtkWidget *widget, GdkEventButton *event, gpointer unused) {
  if (event->button != 1) return FALSE;
  track_active_window(NULL);
  spin.active = TRUE; spin.start_x = event->x_root; spin.start_y = event->y_root; spin.selection = "";
  spinner_set_label("");
  spin.seat = gdk_display_get_default_seat(gdk_display_get_default());
  if (spin.seat) gdk_seat_grab(spin.seat, gtk_widget_get_window(widget),
      GDK_SEAT_CAPABILITY_POINTER, FALSE, NULL, (GdkEvent *)event, NULL, NULL);
  return TRUE;
}

static gboolean spinner_motion(GtkWidget *widget, GdkEventMotion *event, gpointer unused) {
  if (!spin.active) return FALSE;
  spin.selection = spinner_selection(event->x_root - spin.start_x, event->y_root - spin.start_y);
  spinner_set_label(spin.selection);
  return TRUE;
}

static gboolean spinner_release(GtkWidget *widget, GdkEventButton *event, gpointer unused) {
  if (!spin.active || event->button != 1) return FALSE;
  const char *selection = spinner_selection(event->x_root - spin.start_x, event->y_root - spin.start_y);
  if (spin.seat) gdk_seat_ungrab(spin.seat);
  spin.active = FALSE; spin.seat = NULL; spinner_set_label("");
  if (!selection || !*selection) tile_last_client("full");
  else if (!strcmp(selection, "top")) tile_last_client("top");
  else if (!strcmp(selection, "bottom")) tile_last_client("bottom");
  else if (!strcmp(selection, "prev")) focus_relative(-1);
  else if (!strcmp(selection, "next")) focus_relative(1);
  return TRUE;
}

static void show_overview(GtkButton *button, gpointer unused) {
  gtk_entry_set_text(GTK_ENTRY(search_entry), "");
  refresh_running(NULL);
  run_async("wmctrl -k on");
  gtk_window_present(GTK_WINDOW(home_window));
  gtk_widget_grab_focus(search_entry);
}

static gboolean matches_search(const App *app, const char *needle) {
  if (!needle || !*needle) return TRUE;
  char *label = g_ascii_strdown(app->label, -1);
  char *keys = g_ascii_strdown(app->keywords, -1);
  char *q = g_ascii_strdown(needle, -1);
  gboolean match = strstr(label, q) || strstr(keys, q);
  g_free(label); g_free(keys); g_free(q);
  return match;
}

static void search_changed(GtkEditable *editable, gpointer unused) {
  const char *text = gtk_entry_get_text(GTK_ENTRY(editable));
  for (guint i = 0; i < G_N_ELEMENTS(apps); i++)
    gtk_widget_set_visible(app_tiles[i], matches_search(&apps[i], text));
}

static void search_activate(GtkEntry *entry, gpointer unused) {
  const char *text = gtk_entry_get_text(entry);
  for (guint i = 0; i < G_N_ELEMENTS(apps); i++) {
    if (matches_search(&apps[i], text)) {
      launch_app(NULL, (gpointer)&apps[i]);
      return;
    }
  }
}

static GtkWidget *make_tile(const App *app) {
  GtkWidget *button = gtk_button_new();
  GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 16);
  GtkWidget *image = make_icon(app->icon, 156);
  GtkWidget *label = gtk_label_new(app->label);

  gtk_style_context_add_class(gtk_widget_get_style_context(button), "app-tile");
  gtk_style_context_add_class(gtk_widget_get_style_context(label), "app-label");
  gtk_widget_set_hexpand(button, TRUE);
  gtk_widget_set_vexpand(button, FALSE);
  gtk_widget_set_size_request(button, -1, 300);
  gtk_box_pack_start(GTK_BOX(box), image, TRUE, TRUE, 0);
  gtk_box_pack_start(GTK_BOX(box), label, FALSE, FALSE, 0);
  gtk_container_add(GTK_CONTAINER(button), box);
  g_signal_connect(button, "clicked", G_CALLBACK(launch_app), (gpointer)app);
  return button;
}

static void load_css(void) {
  GtkCssProvider *provider = gtk_css_provider_new();
  gtk_css_provider_load_from_path(provider,
      "/data/data/com.termux/files/home/3dvr-shell/style.css", NULL);
  gtk_style_context_add_provider_for_screen(gdk_screen_get_default(),
      GTK_STYLE_PROVIDER(provider), GTK_STYLE_PROVIDER_PRIORITY_APPLICATION);
  g_object_unref(provider);
}

static GtkWidget *section_label(const char *text) {
  GtkWidget *label = gtk_label_new(text);
  gtk_style_context_add_class(gtk_widget_get_style_context(label), "section-label");
  gtk_widget_set_halign(label, GTK_ALIGN_START);
  return label;
}

static GtkWidget *build_home(void) {
  GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  GtkWidget *scroll = gtk_scrolled_window_new(NULL, NULL);
  GtkWidget *outer = gtk_box_new(GTK_ORIENTATION_VERTICAL, 30);
  GtkWidget *title = gtk_label_new("Overview");
  GtkWidget *subtitle = gtk_label_new("Search, switch, or launch.");
  GtkWidget *grid = gtk_grid_new();

  gtk_window_set_decorated(GTK_WINDOW(window), FALSE);
  gtk_window_set_type_hint(GTK_WINDOW(window), GDK_WINDOW_TYPE_HINT_DESKTOP);
  gtk_window_set_keep_below(GTK_WINDOW(window), TRUE);
  gtk_window_set_accept_focus(GTK_WINDOW(window), TRUE);
  int sw = 0, sh = 0;
  get_screen_size(&sw, &sh);
  gtk_window_set_default_size(GTK_WINDOW(window), sw, sh);
  gtk_window_move(GTK_WINDOW(window), 0, 0);
  gtk_style_context_add_class(gtk_widget_get_style_context(window), "home");
  gtk_style_context_add_class(gtk_widget_get_style_context(title), "title");
  gtk_style_context_add_class(gtk_widget_get_style_context(subtitle), "subtitle");
  gtk_widget_set_halign(title, GTK_ALIGN_START);
  gtk_widget_set_halign(subtitle, GTK_ALIGN_START);
  gtk_box_pack_start(GTK_BOX(outer), title, FALSE, FALSE, 0);
  gtk_box_pack_start(GTK_BOX(outer), subtitle, FALSE, FALSE, 0);

  search_entry = gtk_search_entry_new();
  gtk_entry_set_placeholder_text(GTK_ENTRY(search_entry), "Search apps");
  gtk_widget_set_size_request(search_entry, -1, 104);
  gtk_style_context_add_class(gtk_widget_get_style_context(search_entry), "search");
  g_signal_connect(search_entry, "changed", G_CALLBACK(search_changed), NULL);
  g_signal_connect(search_entry, "activate", G_CALLBACK(search_activate), NULL);
  gtk_box_pack_start(GTK_BOX(outer), search_entry, FALSE, FALSE, 0);

  gtk_box_pack_start(GTK_BOX(outer), section_label("Running"), FALSE, FALSE, 0);
  running_box = gtk_box_new(GTK_ORIENTATION_HORIZONTAL, 22);
  gtk_box_pack_start(GTK_BOX(outer), running_box, FALSE, FALSE, 0);

  gtk_box_pack_start(GTK_BOX(outer), section_label("Apps"), FALSE, FALSE, 0);
  gtk_grid_set_row_spacing(GTK_GRID(grid), 18);
  gtk_grid_set_column_spacing(GTK_GRID(grid), 18);
  for (guint i = 0; i < G_N_ELEMENTS(apps); i++) {
    app_tiles[i] = make_tile(&apps[i]);
    gtk_grid_attach(GTK_GRID(grid), app_tiles[i], i % 3, i / 3, 1, 1);
  }
  gtk_box_pack_start(GTK_BOX(outer), grid, FALSE, FALSE, 0);
  gtk_container_set_border_width(GTK_CONTAINER(outer), 64);
  gtk_widget_set_margin_top(outer, 120);
  gtk_scrolled_window_set_policy(GTK_SCROLLED_WINDOW(scroll), GTK_POLICY_NEVER, GTK_POLICY_AUTOMATIC);
  gtk_container_add(GTK_CONTAINER(scroll), outer);
  gtk_container_add(GTK_CONTAINER(window), scroll);
  g_signal_connect(window, "destroy", G_CALLBACK(gtk_main_quit), NULL);
  return window;
}

static void reserve_top(GtkWidget *window) {
  GdkWindow *gw = gtk_widget_get_window(window);
  if (!gw) return;
  Display *dpy = GDK_DISPLAY_XDISPLAY(gdk_window_get_display(gw));
  Window xid = GDK_WINDOW_XID(gw);
  int sw = 0, sh = 0;
  get_screen_size(&sw, &sh);
  unsigned long strut[4] = {0, 0, BAR_HEIGHT, 0};
  unsigned long partial[12] = {0,0,BAR_HEIGHT,0, 0,0,0,0, 0,(unsigned long)(sw-1),0,0};
  Atom a = XInternAtom(dpy, "_NET_WM_STRUT", False);
  Atom ap = XInternAtom(dpy, "_NET_WM_STRUT_PARTIAL", False);
  XChangeProperty(dpy, xid, a, XA_CARDINAL, 32, PropModeReplace, (unsigned char*)strut, 4);
  XChangeProperty(dpy, xid, ap, XA_CARDINAL, 32, PropModeReplace, (unsigned char*)partial, 12);
  XFlush(dpy);
}

static void shape_spinner_window(GtkWidget *window) {
  GdkWindow *gw = gtk_widget_get_window(window);
  if (!gw) return;
  Display *dpy = GDK_DISPLAY_XDISPLAY(gdk_window_get_display(gw));
  Window xid = GDK_WINDOW_XID(gw);
  int w = gtk_widget_get_allocated_width(window);
  int h = gtk_widget_get_allocated_height(window);
  Pixmap mask = XCreatePixmap(dpy, xid, w, h, 1);
  GC gc = XCreateGC(dpy, mask, 0, NULL);
  XSetForeground(dpy, gc, 0); XFillRectangle(dpy, mask, gc, 0, 0, w, h);
  XSetForeground(dpy, gc, 1); XFillArc(dpy, mask, gc, 0, 0, w, h, 0, 360 * 64);
  XShapeCombineMask(dpy, xid, ShapeBounding, 0, 0, mask, ShapeSet);
  XFreeGC(dpy, gc); XFreePixmap(dpy, mask); XFlush(dpy);
}

static GtkWidget *build_spinner_window(void) {
  const int size = 220;
  GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  GtkWidget *event = gtk_event_box_new();
  spinner_label = gtk_label_new("◎");
  gtk_window_set_decorated(GTK_WINDOW(window), FALSE);
  gtk_window_set_resizable(GTK_WINDOW(window), FALSE);
  gtk_window_set_keep_above(GTK_WINDOW(window), TRUE);
  gtk_window_set_accept_focus(GTK_WINDOW(window), FALSE);
  gtk_window_set_focus_on_map(GTK_WINDOW(window), FALSE);
  gtk_window_set_skip_taskbar_hint(GTK_WINDOW(window), TRUE);
  gtk_window_set_skip_pager_hint(GTK_WINDOW(window), TRUE);
  gtk_window_set_type_hint(GTK_WINDOW(window), GDK_WINDOW_TYPE_HINT_UTILITY);
  gtk_window_set_default_size(GTK_WINDOW(window), size, size);
  int sw = 0, sh = 0;
  get_screen_size(&sw, &sh);
  gtk_window_move(GTK_WINDOW(window), sw - size - 28, (sh - size) / 2);
  gtk_style_context_add_class(gtk_widget_get_style_context(window), "spinner-float");
  gtk_style_context_add_class(gtk_widget_get_style_context(event), "spinner-knob");
  gtk_style_context_add_class(gtk_widget_get_style_context(spinner_label), "spinner-label");
  gtk_container_add(GTK_CONTAINER(event), spinner_label);
  gtk_container_add(GTK_CONTAINER(window), event);
  gtk_widget_add_events(event, GDK_BUTTON_PRESS_MASK | GDK_BUTTON_RELEASE_MASK | GDK_POINTER_MOTION_MASK);
  g_signal_connect(event, "button-press-event", G_CALLBACK(spinner_press), NULL);
  g_signal_connect(event, "motion-notify-event", G_CALLBACK(spinner_motion), NULL);
  g_signal_connect(event, "button-release-event", G_CALLBACK(spinner_release), NULL);
  return window;
}

static GtkWidget *build_bar(void) {
  GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
  GtkWidget *grid = gtk_grid_new();
  GtkWidget *brand = gtk_button_new_with_label("3DVR");
  input_button = gtk_button_new_with_label("Touch");
  GtkWidget *overview = gtk_button_new_with_label("Overview");

  gtk_window_set_decorated(GTK_WINDOW(window), FALSE);
  gtk_window_set_keep_above(GTK_WINDOW(window), TRUE);
  gtk_window_set_accept_focus(GTK_WINDOW(window), FALSE);
  gtk_window_set_focus_on_map(GTK_WINDOW(window), FALSE);
  gtk_window_set_type_hint(GTK_WINDOW(window), GDK_WINDOW_TYPE_HINT_DOCK);
  int sw = 0, sh = 0;
  get_screen_size(&sw, &sh);
  gtk_window_set_default_size(GTK_WINDOW(window), sw, BAR_HEIGHT);
  gtk_window_move(GTK_WINDOW(window), 0, 0);
  gtk_style_context_add_class(gtk_widget_get_style_context(window), "topbar");
  gtk_widget_set_hexpand(grid, TRUE);
  gtk_widget_set_vexpand(grid, TRUE);
  gtk_widget_set_hexpand(clock_label, TRUE);
  gtk_widget_set_halign(clock_label, GTK_ALIGN_CENTER);
  gtk_widget_set_halign(brand, GTK_ALIGN_START);
  gtk_widget_set_halign(overview, GTK_ALIGN_END);
  gtk_style_context_add_class(gtk_widget_get_style_context(brand), "bar-button");
  gtk_style_context_add_class(gtk_widget_get_style_context(input_button), "bar-button");
  gtk_style_context_add_class(gtk_widget_get_style_context(overview), "bar-button");
  gtk_style_context_add_class(gtk_widget_get_style_context(clock_label), "clock");

  gtk_grid_attach(GTK_GRID(grid), brand, 0, 0, 1, 1);
  gtk_grid_attach(GTK_GRID(grid), clock_label, 1, 0, 1, 1);
  gtk_grid_attach(GTK_GRID(grid), input_button, 2, 0, 1, 1);
  gtk_grid_attach(GTK_GRID(grid), overview, 3, 0, 1, 1);
  gtk_grid_set_column_homogeneous(GTK_GRID(grid), TRUE);
  gtk_container_set_border_width(GTK_CONTAINER(grid), 18);
  gtk_container_add(GTK_CONTAINER(window), grid);
  g_signal_connect(brand, "clicked", G_CALLBACK(show_overview), NULL);
  g_signal_connect(input_button, "clicked", G_CALLBACK(toggle_input), NULL);
  g_signal_connect(overview, "clicked", G_CALLBACK(show_overview), NULL);
  sync_input_label();
  return window;
}

int main(int argc, char **argv) {
  gtk_init(&argc, &argv);
  load_css();
  clock_label = gtk_label_new("");
  home_window = build_home();
  GtkWidget *bar = build_bar();
  GtkWidget *spinner = build_spinner_window();

  update_clock(NULL);
  refresh_running(NULL);
  track_active_window(NULL);
  g_timeout_add_seconds(20, update_clock, NULL);
  g_timeout_add(350, track_active_window, NULL);
  gtk_widget_show_all(home_window);
  gtk_widget_show_all(bar);
  gtk_widget_show_all(spinner);
  reserve_top(bar);
  shape_spinner_window(spinner);
  gtk_main();
  return 0;
}
