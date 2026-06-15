"""phase2 assets: avatars, closet_items, pose_renders, tryon_results

Revision ID: 0002_assets
Revises: 0001_init
Create Date: 2026-06-14

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_assets"
down_revision: Union[str, None] = "0001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "avatars",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("params_json", sa.JSON(), nullable=True),
        sa.Column("source_job_id", sa.String(length=64), nullable=True),
        sa.Column("is_default", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_avatars_user_id", "avatars", ["user_id"])

    op.create_table(
        "closet_items",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=True),
        sa.Column("garment_type", sa.String(length=40), nullable=False),
        sa.Column("original_image_url", sa.Text(), nullable=True),
        sa.Column("extracted_image_url", sa.Text(), nullable=False),
        sa.Column("extract_job_id", sa.String(length=64), nullable=True),
        sa.Column("favorited", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_closet_items_user_id", "closet_items", ["user_id"])

    op.create_table(
        "pose_renders",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("avatar_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("pose_key", sa.String(length=40), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="succeeded", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["avatar_id"], ["avatars.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_pose_renders_user_id", "pose_renders", ["user_id"])
    op.create_index("ix_pose_renders_avatar_id", "pose_renders", ["avatar_id"])

    op.create_table(
        "tryon_results",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("avatar_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("pose_render_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("closet_item_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("pose_key", sa.String(length=40), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="succeeded", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["avatar_id"], ["avatars.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pose_render_id"], ["pose_renders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["closet_item_id"], ["closet_items.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_tryon_results_user_id", "tryon_results", ["user_id"])
    op.create_index("ix_tryon_results_avatar_id", "tryon_results", ["avatar_id"])


def downgrade() -> None:
    op.drop_table("tryon_results")
    op.drop_table("pose_renders")
    op.drop_table("closet_items")
    op.drop_table("avatars")
