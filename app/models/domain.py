from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


question_tag_association = Table(
    "question_tag_link",
    Base.metadata,
    Column(
        "question_id",
        Integer,
        ForeignKey("questions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        Integer,
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class RawPaper(Base):
    __tablename__ = "raw_papers"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    paper_type = Column(String(50))
    source_url = Column(String(500))
    status = Column(String(50), default="pending")

    created_at = Column(DateTime, default=datetime.utcnow)

    questions = relationship(
        "Question", back_populates="paper", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    raw_paper_id = Column(Integer, ForeignKey("raw_papers.id", ondelete="CASCADE"))
    problem_number = Column(String(50))

    content_latex = Column(Text, nullable=False)
    answer_latex = Column(Text)
    image_url = Column(String(500))

    difficulty = Column(Float)
    elo_anchor = Column(Integer, default=1500)
    status = Column(String(50), default="pending_review")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    paper = relationship("RawPaper", back_populates="questions")
    tags = relationship(
        "Tag", secondary=question_tag_association, back_populates="questions"
    )


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    category = Column(String(50), default="knowledge")

    questions = relationship(
        "Question", secondary=question_tag_association, back_populates="tags"
    )