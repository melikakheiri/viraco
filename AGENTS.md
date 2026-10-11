# Task Board instructions

- Keep browser calls behind Next.js `/api/v1/*`; business logic belongs in NestJS.
- Never enable TypeORM `synchronize`; all schema changes require reviewed migrations.
- Validate input, avoid leaking secrets, and keep credentials in environment variables.
- Add meaningful tests for behavior and run build/lint before handoff.
- Review AI-generated changes for security, RTL accessibility, and migration safety.
