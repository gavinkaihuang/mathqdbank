from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
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
    page_urls = Column(JSON, default=list)
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
    question_type = Column(String(50), nullable=False)
    type_specific_data = Column(JSON, default=dict)

    content_latex = Column(Text, nullable=False)
    answer_latex = Column(Text)
    image_url = Column(String(500))

    difficulty = Column(Float)
    elo_anchor = Column(Integer, default=1500)
    status = Column(String(50), default="pending_review")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    paper = relationship("RawPaper", back_populates="questions")
    images = relationship(
        "QuestionImage", back_populates="question", cascade="all, delete-orphan"
    )
    tags = relationship(
        "Tag", secondary=question_tag_association, back_populates="questions"
    )


class QuestionImage(Base):
    __tablename__ = "question_images"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"))
    image_url = Column(String(500), nullable=False)
    desc = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="images")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    category = Column(String(50), default="knowledge")

    questions = relationship(
        "Question", secondary=question_tag_association, back_populates="tags"
    )


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(String(500), nullable=False)
    version = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    model_routing_key = Column(String(50), nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)