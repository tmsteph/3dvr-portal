package tech.threedvr.companion

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class CompanionAccessibilityService : AccessibilityService() {
    companion object {
        @Volatile private var current: CompanionAccessibilityService? = null

        fun snapshot(): Map<String, Any?> = current?.snapshotInternal()
            ?: mapOf("available" to false)

        fun perform(action: Map<String, Any?>): Boolean = current?.performInternal(action) ?: false
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        current = this
        CompanionNativeBridgeServer.ensureStarted(this)
    }

    override fun onDestroy() {
        if (current === this) current = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Actions are requested on demand through the authenticated local bridge.
        // Do not stream raw accessibility events or screen text off-device.
    }

    override fun onInterrupt() = Unit

    private fun snapshotInternal(): Map<String, Any?> {
        val root = rootInActiveWindow ?: return mapOf("available" to false)
        val nodes = mutableListOf<Map<String, Any?>>()
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        while (queue.isNotEmpty() && nodes.size < 500) {
            val node = queue.removeFirst()
            val bounds = Rect().also(node::getBoundsInScreen)
            nodes += mapOf(
                "index" to nodes.size,
                "packageName" to node.packageName?.toString(),
                "className" to node.className?.toString(),
                "viewId" to node.viewIdResourceName,
                "text" to node.text?.toString(),
                "contentDescription" to node.contentDescription?.toString(),
                "clickable" to node.isClickable,
                "longClickable" to node.isLongClickable,
                "editable" to node.isEditable,
                "scrollable" to node.isScrollable,
                "enabled" to node.isEnabled,
                "bounds" to mapOf(
                    "left" to bounds.left,
                    "top" to bounds.top,
                    "right" to bounds.right,
                    "bottom" to bounds.bottom,
                ),
            )
            for (index in 0 until node.childCount) {
                node.getChild(index)?.let(queue::add)
            }
        }
        return mapOf(
            "available" to true,
            "packageName" to root.packageName?.toString(),
            "className" to root.className?.toString(),
            "nodeCount" to nodes.size,
            "nodes" to nodes,
        )
    }

    private fun performInternal(action: Map<String, Any?>): Boolean {
        return when ((action["kind"] as? String)?.trim()?.lowercase()) {
            "global" -> performGlobal(action["action"] as? String)
            "click" -> performNodeAction(action, AccessibilityNodeInfo.ACTION_CLICK)
            "long_click", "longclick" -> performNodeAction(action, AccessibilityNodeInfo.ACTION_LONG_CLICK)
            "focus" -> performNodeAction(action, AccessibilityNodeInfo.ACTION_FOCUS)
            "scroll_forward", "scrollforward" -> performNodeAction(action, AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
            "scroll_backward", "scrollbackward" -> performNodeAction(action, AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
            "set_text", "settext" -> setNodeText(action)
            "tap" -> dispatchTap(action)
            "swipe" -> dispatchSwipe(action)
            else -> false
        }
    }

    private fun performGlobal(raw: String?): Boolean {
        val global = when (raw?.trim()?.lowercase()) {
            "back" -> GLOBAL_ACTION_BACK
            "home" -> GLOBAL_ACTION_HOME
            "recents" -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            "quick_settings", "quicksettings" -> GLOBAL_ACTION_QUICK_SETTINGS
            "power_dialog", "powerdialog" -> GLOBAL_ACTION_POWER_DIALOG
            "lock_screen", "lockscreen" -> GLOBAL_ACTION_LOCK_SCREEN
            else -> return false
        }
        return performGlobalAction(global)
    }

    private fun performNodeAction(action: Map<String, Any?>, nodeAction: Int): Boolean {
        val node = findNode(action) ?: return false
        if (!node.isEnabled) return false
        if (node.performAction(nodeAction)) return true
        if (nodeAction == AccessibilityNodeInfo.ACTION_CLICK) {
            var parent = node.parent
            repeat(5) {
                val candidate = parent ?: return@repeat
                if (candidate.isClickable && candidate.isEnabled && candidate.performAction(nodeAction)) {
                    return true
                }
                parent = candidate.parent
            }
        }
        return false
    }

    private fun setNodeText(action: Map<String, Any?>): Boolean {
        val node = findNode(action) ?: return false
        val text = action["value"] as? String ?: return false
        if (text.length > 4000 || !node.isEnabled) return false
        val arguments = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
    }

    private fun findNode(action: Map<String, Any?>): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val viewId = (action["viewId"] as? String)?.trim().orEmpty()
        if (viewId.isNotEmpty()) {
            root.findAccessibilityNodeInfosByViewId(viewId).firstOrNull()?.let { return it }
        }
        val wantedText = (action["text"] as? String)?.trim().orEmpty()
        if (wantedText.isNotEmpty()) {
            val exact = root.findAccessibilityNodeInfosByText(wantedText).firstOrNull {
                it.text?.toString()?.equals(wantedText, ignoreCase = true) == true ||
                    it.contentDescription?.toString()?.equals(wantedText, ignoreCase = true) == true
            }
            if (exact != null) return exact
            root.findAccessibilityNodeInfosByText(wantedText).firstOrNull()?.let { return it }
        }
        val description = (action["contentDescription"] as? String)?.trim().orEmpty()
        if (description.isNotEmpty()) {
            val queue = ArrayDeque<AccessibilityNodeInfo>()
            queue.add(root)
            var visited = 0
            while (queue.isNotEmpty() && visited < 500) {
                val node = queue.removeFirst()
                visited += 1
                if (node.contentDescription?.toString()?.equals(description, ignoreCase = true) == true) {
                    return node
                }
                for (index in 0 until node.childCount) node.getChild(index)?.let(queue::add)
            }
        }
        return null
    }

    private fun dispatchTap(action: Map<String, Any?>): Boolean {
        val x = (action["x"] as? Number)?.toFloat() ?: return false
        val y = (action["y"] as? Number)?.toFloat() ?: return false
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 80))
            .build()
        return dispatchGesture(gesture, null, null)
    }

    private fun dispatchSwipe(action: Map<String, Any?>): Boolean {
        val x1 = (action["x1"] as? Number)?.toFloat() ?: return false
        val y1 = (action["y1"] as? Number)?.toFloat() ?: return false
        val x2 = (action["x2"] as? Number)?.toFloat() ?: return false
        val y2 = (action["y2"] as? Number)?.toFloat() ?: return false
        val duration = ((action["durationMs"] as? Number)?.toLong() ?: 350L).coerceIn(50L, 5000L)
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, duration))
            .build()
        return dispatchGesture(gesture, null, null)
    }
}
