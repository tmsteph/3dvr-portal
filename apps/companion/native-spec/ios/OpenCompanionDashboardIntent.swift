import AppIntents

struct OpenCompanionDashboardIntent: AppIntent {
    static var title: LocalizedStringResource = "Open 3DVR Companion"
    static var description = IntentDescription("Open the 3DVR Companion dashboard and approval queue.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        .result()
    }
}

struct CompanionShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenCompanionDashboardIntent(),
            phrases: [
                "Open Companion in \(.applicationName)",
                "Show my assistant in \(.applicationName)",
            ],
            shortTitle: "Open Companion",
            systemImageName: "sparkles"
        )
    }
}
