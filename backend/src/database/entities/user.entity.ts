import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, Check } from 'typeorm';
import { Task } from './task.entity';
import { RefreshSession } from './refresh-session.entity';
export enum UserRole { OWNER = 'OWNER', MANAGER = 'MANAGER', MEMBER = 'MEMBER' }
@Entity('users')
@Index('uq_users_email', ['email'], { unique: true })
@Check('ck_users_email', "email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'")
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 254 }) email!: string;
  @Column({ name: 'password_hash', type: 'text', select: false }) passwordHash!: string;
  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' }) role!: UserRole;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(() => Task, task => task.creator) createdTasks!: Task[];
  @OneToMany(() => Task, task => task.assignee) assignedTasks!: Task[];
  @OneToMany(() => RefreshSession, session => session.user) refreshSessions!: RefreshSession[];
}
