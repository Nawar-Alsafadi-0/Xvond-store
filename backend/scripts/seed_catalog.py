import asyncio

from sqlalchemy import select

from app.core.database import SessionFactory, engine
from app.models.commerce import Category

CATEGORIES = (
    ("women", "نساء", "Women"),
    ("kids", "أطفال", "Kids"),
    ("electronics", "إلكترونيات", "Electronics"),
    ("xvond-box", "صناديق هدايا", "Gift Boxes"),
    ("luxury-gifts", "هدايا", "Gifts"),
    ("automotive", "السيارات ومستلزماتها", "Automotive"),
)


async def seed() -> None:
    async with SessionFactory() as session:
        existing = set(await session.scalars(select(Category.slug)))
        session.add_all(
            Category(slug=slug, name_ar=name_ar, name_en=name_en)
            for slug, name_ar, name_en in CATEGORIES
            if slug not in existing
        )
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
