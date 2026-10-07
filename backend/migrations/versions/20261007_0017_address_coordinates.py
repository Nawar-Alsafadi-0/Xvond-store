"""add saved address coordinates

Revision ID: 20261007_0017
Revises: 20260904_0016
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261007_0017"
down_revision: str | Sequence[str] | None = "20260904_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("addresses", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("addresses", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("addresses", "longitude")
    op.drop_column("addresses", "latitude")
