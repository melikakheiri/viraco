import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
@Entity('refresh_sessions')
@Index('ix_refresh_sessions_user', ['userId'])
@Index('ix_refresh_sessions_expiry', ['expiresAt'])
@Check('ck_refresh_sessions_expiry', 'expires_at > created_at')
@Check('ck_refresh_sessions_revocation', '(revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_at >= created_at)')
export class RefreshSession {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User, user => user.refreshSessions, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'fk_refresh_sessions_user' }) user!: User;
  @Column({ name: 'refresh_token_hash', type: 'text', select: false }) refreshTokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ name: 'revocation_reason', type: 'varchar', length: 255, nullable: true }) revocationReason!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
