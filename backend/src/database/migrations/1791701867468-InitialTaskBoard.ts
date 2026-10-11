import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialTaskBoard1791701867468 implements MigrationInterface {
    name = 'InitialTaskBoard1791701867468'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done')`);
        await queryRunner.query(`CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high')`);
        await queryRunner.query(`CREATE TABLE "tasks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(255) NOT NULL, "status" "public"."task_status" NOT NULL DEFAULT 'todo', "priority" "public"."task_priority" NOT NULL DEFAULT 'medium', "creator_id" uuid NOT NULL, "assignee_id" uuid, "due_date" TIMESTAMP WITH TIME ZONE, "description" jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_tasks_description" CHECK (jsonb_typeof(description) = 'object' AND description ? 'type' AND description->>'type' = 'doc' AND (NOT description ? 'content' OR jsonb_typeof(description->'content') = 'array')), CONSTRAINT "ck_tasks_title" CHECK (length(btrim(title)) > 0), CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_tasks_status_due" ON "tasks" ("status", "due_date") `);
        await queryRunner.query(`CREATE INDEX "ix_tasks_assignee_status" ON "tasks" ("assignee_id", "status") `);
        await queryRunner.query(`CREATE INDEX "ix_tasks_creator" ON "tasks" ("creator_id") `);
        await queryRunner.query(`CREATE TABLE "refresh_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "refresh_token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "revocation_reason" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_refresh_sessions_revocation" CHECK ((revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_at >= created_at)), CONSTRAINT "ck_refresh_sessions_expiry" CHECK (expires_at > created_at), CONSTRAINT "PK_9190032f6967b7971dca07d69f3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "ix_refresh_sessions_expiry" ON "refresh_sessions" ("expires_at") `);
        await queryRunner.query(`CREATE INDEX "ix_refresh_sessions_user" ON "refresh_sessions" ("user_id") `);
        await queryRunner.query(`CREATE TYPE "public"."user_role" AS ENUM('OWNER', 'MANAGER', 'MEMBER')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(254) NOT NULL, "password_hash" text NOT NULL, "role" "public"."user_role" NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "ck_users_email" CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") `);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "fk_tasks_creator" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tasks" ADD CONSTRAINT "fk_tasks_assignee" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_sessions" ADD CONSTRAINT "fk_refresh_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "refresh_sessions" DROP CONSTRAINT "fk_refresh_sessions_user"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "fk_tasks_assignee"`);
        await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "fk_tasks_creator"`);
        await queryRunner.query(`DROP INDEX "public"."uq_users_email"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."user_role"`);
        await queryRunner.query(`DROP INDEX "public"."ix_refresh_sessions_user"`);
        await queryRunner.query(`DROP INDEX "public"."ix_refresh_sessions_expiry"`);
        await queryRunner.query(`DROP TABLE "refresh_sessions"`);
        await queryRunner.query(`DROP INDEX "public"."ix_tasks_creator"`);
        await queryRunner.query(`DROP INDEX "public"."ix_tasks_assignee_status"`);
        await queryRunner.query(`DROP INDEX "public"."ix_tasks_status_due"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TYPE "public"."task_priority"`);
        await queryRunner.query(`DROP TYPE "public"."task_status"`);
    }

}
