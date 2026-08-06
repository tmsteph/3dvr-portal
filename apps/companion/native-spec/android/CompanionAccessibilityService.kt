package tech.threedvr.companion

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * v0.1 deliberately observes only bounded metadata.
 *
 * Remote gesture execution is NOT enabled here. Future known actions must be
 * implemented as local named functions with explicit package/selector rules.
 */
class CompanionAccessibilityService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Keep v0.1 local-only. Do not upload raw accessibility events or text.
    }

    override fun onInterrupt() = Unit

    fun activeWindowSummary(): Map<String, Any?> {
        val root = rootInActiveWindow ?: return mapOf("available" to false)
        return mapOf(
            "available" to true,
            "packageName" to root.packageName?.toString(),
            "className" to root.className?.toString(),
            "nodeCount" to countNodes(root, 250),
        )
    }

    private fun countNodes(root: AccessibilityNodeInfo, limit: Int): Int {
        var count = 0
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty() && count < limit) {
            val node = queue.removeFirst()
            count += 1
            for (index in 0 until node.childCount) {
                node.getChild(index)?.let(queue::add)
            }
        }
        return count
    }
}
