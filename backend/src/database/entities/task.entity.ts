import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
export enum TaskStatus { TODO = 'todo', IN_PROGRESS = 'in_progress', DONE = 'done' }
export enum TaskPriority { LOW = 'low', MEDIUM = 'medium', HIGH = 'high' }
export interface TipTapDocument { type: 'doc'; content?: Record<string, unknown>[] }
@Entity('tasks')
@Check('ck_tasks_title', 'length(btrim(title)) > 0')
@Check('ck_tasks_description', "jsonb_typeof(description) = 'object' AND description ? 'type' AND description->>'type' = 'doc' AND (NOT description ? 'content' OR jsonb_typeof(description->'content') = 'array')")
@Index('ix_tasks_creator', ['creatorId'])
@Index('ix_tasks_assignee_status', ['assigneeId', 'status'])
@Index('ix_tasks_status_due', ['status', 'dueDate'])
export class Task {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) title!: string;
  @Column({ type: 'enum', enum: TaskStatus, enumName: 'task_status', default: TaskStatus.TODO }) status!: TaskStatus;
  @Column({ type: 'enum', enum: TaskPriority, enumName: 'task_priority', default: TaskPriority.MEDIUM }) priority!: TaskPriority;
  @Column({ name: 'creator_id', type: 'uuid' }) creatorId!: string;
  @ManyToOne(() => User, user => user.createdTasks, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'creator_id', foreignKeyConstraintName: 'fk_tasks_creator' }) creator!: User;
  @Column({ name: 'assignee_id', type: 'uuid', nullable: true }) assigneeId!: string | null;
  @ManyToOne(() => User, user => user.assignedTasks, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_id', foreignKeyConstraintName: 'fk_tasks_assignee' }) assignee!: User | null;
  @Column({ name: 'due_date', type: 'timestamptz', nullable: true }) dueDate!: Date | null;
  @Column({ type: 'jsonb', default: { type: 'doc', content: [] } }) description!: TipTapDocument;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
