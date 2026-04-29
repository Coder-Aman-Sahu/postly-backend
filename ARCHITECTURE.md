# Architecture Overview

## Data Flow
1. **User Interaction**: User interacts via the Telegram Bot Webhook (`/api/bot/webhook`).
2. **State Management**: `src/bot/handlers.js` manages conversational state sequentially using Redis (`EX` 30 mins).
3. **AI Generation**: Idea is passed to `src/services/ai.service.js` which formats requests to OpenAI/Claude based on strict platform limits.
4. **Queueing**: Once confirmed, the master `Post` and child `PlatformPost` records are created in PostgreSQL.
5. **Publishing**: `PlatformPost` IDs are sent to the BullMQ `publish` queue.
6. **Processing**: The BullMQ Worker attempts API calls. On partial failures (e.g., Twitter succeeds, LinkedIn fails), only the specific `PlatformPost` is marked as failed, allowing targeted retries without double-posting.

## Schema Strategy
- **Tokens**: OAuth tokens and AI keys are securely stored using AES-256-CBC encryption in PostgreSQL.
- **Relationships**: `Post` operates as an aggregate root with a 1-to-many relationship to `PlatformPost` ensuring strict decoupling of status per platform.
