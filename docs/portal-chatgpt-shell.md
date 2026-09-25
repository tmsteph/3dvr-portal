# Portal ChatGPT Shell

## Goal

Make the Portal the primary conversational interface for 3DVR: one continuous chat surface that can understand the page the user is viewing, summon Portal capabilities when useful, and continue the same work across devices.

The experience should feel like one computing environment, not a collection of pages with a chatbot bolted on.

## Product contract

1. Conversation first. The composer is the main control surface.
2. Context follows the user. Moving between Plan, CRM, Projects, Servers, Notes, and other Portal areas must not discard the active thread.
3. Software appears when needed. Structured Portal UI should be invoked from chat instead of forcing the user to hunt through menus.
4. User-owned context sits above any model provider. Projects, permissions, notes, memory, and audit history remain 3DVR data.
5. The model is replaceable. OpenAI is the primary provider, but Portal state must not become inseparable from one model or vendor.
6. Actions remain permissioned. Reading, organizing, drafting, and reversible workspace changes can be low-friction; consequential external actions still use explicit approval gates.

## What already exists

The current Operator surface already provides a strong base:

- streaming responses
- image attachments
- local conversation persistence
- encrypted account conversation sync through Gun
- Portal app context collection
- action execution and Forge handoff
- conversation history
- home-page mini Operator
- mobile-first chat layout

This project extends that path rather than creating another chat app.

## Architecture

### 1. Portal chat shell

Operator becomes the reusable shell contract for the Portal:

- persistent composer
- active conversation identity
- streaming message log
- attachments and voice entry
- context indicator for the current Portal surface
- inline actions and rich Portal views
- conversation history and device continuity

The first implementation step preserves conversation identity and page context when moving from the home screen into full Operator.

### 2. Conversation state

3DVR keeps its own conversation metadata and user-owned context. The OpenAI integration can additionally use the Responses API with Conversations for provider-side multi-turn state.

OpenAI currently recommends the Responses API for stateful interactions, and the Conversations API provides a durable conversation identifier that can be reused across sessions, devices, and jobs:

- https://developers.openai.com/api/docs/guides/conversation-state

The 3DVR conversation ID remains the portable identity. Provider conversation IDs should be stored as adapters beneath it, not used as the only source of truth.

### 3. 3DVR context and memory

Before a model request, the shell should assemble only the relevant context:

- signed-in identity
- active Portal page
- active project or record
- recent conversation turns
- relevant durable memories
- upcoming tasks/calendar state
- current permissions and available tools

This context layer is also the bridge between Portal conversations and ChatGPT conversations. We should not depend on importing private consumer ChatGPT history into the Portal.

### 4. Tool and action layer

Portal capabilities stay behind narrow, auditable tools. The chat shell requests an action; the action layer decides whether it is:

- safe and automatic
- reversible workspace work
- approval-required
- unsupported

Existing Operator actions and Forge are the starting implementation.

### 5. ChatGPT bridge

Expose selected 3DVR capabilities back to ChatGPT through a 3DVR plugin/MCP server. That creates two doors into the same user-owned system:

```
Portal chat shell
      |
      v
3DVR context + memory + permissions + tools
      ^
      |
ChatGPT + 3DVR MCP plugin
```

OpenAI's current plugin architecture uses MCP for tools and live data, with optional UI that can render inside ChatGPT:

- https://developers.openai.com/plugins
- https://developers.openai.com/plugins/build/mcp-server

The goal is shared working context and capabilities, not pretending the Portal is the consumer ChatGPT client.

### 6. Voice

After the text shell is stable, add realtime voice as another input/output mode. Voice should use the same conversation, context, permissions, and tool layer rather than becoming a separate assistant.

## Delivery phases

### Phase 1 - seamless Portal shell

- [x] Keep the existing Operator as the canonical chat surface.
- [x] Define a page-context handoff contract.
- [x] Preserve the active conversation when moving from the home mini Operator to full Operator.
- [x] Show the source page inside Operator.
- [ ] Add the lightweight chat entry point to the highest-use Portal surfaces.
- [ ] Make project/record identity part of page context.
- [ ] Keep the composer state when navigating back from a Portal action.

### Phase 2 - durable provider conversation adapter

- [ ] Add a server-side mapping from 3DVR conversation IDs to OpenAI Conversation IDs.
- [ ] Move multi-turn OpenAI state to Responses + Conversations.
- [ ] Keep a provider-neutral event record sufficient to migrate or replay important state.
- [ ] Add compaction and retrieval so long-running threads stay efficient.

### Phase 3 - Portal-native tools

- [ ] Normalize Plan, Projects, CRM, Notes, Calendar, Files, and server status as Operator tools.
- [ ] Render tool results inline when a full page is unnecessary.
- [ ] Reuse existing Portal pages as expanded views rather than duplicating their business logic.

### Phase 4 - ChatGPT bridge

- [ ] Expose a small read-first 3DVR MCP surface.
- [ ] Add write tools with explicit permission classes.
- [ ] Connect the 3DVR plugin in ChatGPT.
- [ ] Verify that Portal and ChatGPT can act on the same projects and memory without copying credentials into either conversation.

### Phase 5 - voice and ambient access

- [ ] Add realtime voice.
- [ ] Support interruption and tool progress.
- [ ] Make the same shell installable as a PWA and usable from phone, laptop, and future 3DVR devices.

## Data boundaries

Portal conversation metadata and durable 3DVR memory are user-owned 3DVR state. Provider IDs are references, not identity.

Do not put secrets in conversation history or URL handoffs. Secret material continues through the existing 3DVR Secrets path.

Page handoff data is intentionally limited to non-secret navigation context such as path, title, and heading.

## Success criteria

The shell is working when a user can:

1. start a conversation on the Portal home screen
2. open full chat without losing the thread
3. move to a Portal tool or page
4. return to chat with the tool/page context understood
5. continue from another signed-in device
6. use the same 3DVR tools and memory from ChatGPT through MCP

The subjective test is simple: navigation should feel like moving around inside one conversation.
