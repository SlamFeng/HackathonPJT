"""batch: add batch_id to jobs (group one /v1/jobs/batch submission)

Revision ID: 0007_job_batch_id
Revises: 0006_credits
Create Date: 2026-06-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_job_batch_id"
down_revision: Union[str, None] = "0006_credits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("batch_id", sa.Uuid(as_uuid=True), nullable=True))
    op.create_index("ix_jobs_batch_id", "jobs", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_jobs_batch_id", table_name="jobs")
    op.drop_column("jobs", "batch_id")
