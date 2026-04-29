# AI Usage Transparency
- **Tool:** ChatGPT / Claude
- **Task:** BullMQ setup, backoff logic, and Postgres Prisma associations.
- **Validation:** I used AI to scaffold the BullMQ worker event failure loop (`worker.on('failed')`). I verified the backoff strategy manually by observing the redis logs and ensured the exponential backoff math matched the 1s -> 5s -> 25s requirement stated in the brief. I also validated the encryption IV concatenation method to ensure data integrity.
