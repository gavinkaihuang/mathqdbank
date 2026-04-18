"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ManualCropModal from "@/components/ManualCropModal";
import QuestionStemEditorPanel from "../../_components/QuestionStemEditorPanel";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Loader2,
  LogOut,
  RefreshCcw,
  Scissors,
  SkipForward,
} from "lucide-react";

type QuestionStatus = "pending" | "approved" | "skipped";
type Difficulty = "easy" | "medium" | "hard";
type BusyAction = "none" | "save";

type ApiTag = {
  id: number;
  name: string;
  category: string;
};

type RawPaperQuestionPayload = {
  id: number;
  problem_number: string | null;
  question_type: string;
  content_latex: string | null;
  answer_latex: string | null;
  image_url: string | null;
  crop_urls: string[];
  type_specific_data?: Record<string, unknown>;
  difficulty?: number | null;
  status?: string;
  tags?: ApiTag[];
};

type RawPaperPayload = {
  id: number;
  title: string;
  original_url: string | null;
  original_urls?: string[];
  recognized_count: number;
  questions: RawPaperQuestionPayload[];
  detail?: string;
};

type QuestionPatchResponse = {
  id: number;
  problem_number: string | null;
  question_type: string;
  type_specific_data?: Record<string, unknown>;
  content_latex: string;
  answer_latex: string | null;
  image_url: string | null;
  difficulty?: number | null;
  status?: string;
  tags?: ApiTag[];
  detail?: string;
};

type TagsListResponse = {
  items?: ApiTag[];
  detail?: string;
};

type ReviewQuestion = {
  id: number;
  problemNumber: string;
  type: string;
  status: QuestionStatus;
  fullPaperImage: string;
  questionImage: string;
  cropImages: string[];
  latex: string;
  answer: string;
  options: string[];
  difficulty: Difficulty;
  tags: string[];
  sourcePageIndex: number;
  typeSpecificData: Record<string, unknown>;
};

type ReviewFormData = {
  latex: string;
  answer: string;
  options: string[];
  difficulty: Difficulty;
  tags: string[];
  tagInput: string;
};

const EMPTY_OPTIONS = ["", "", "", ""];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = (value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeOptions(value: unknown) {
  if (!Array.isArray(value)) return [...EMPTY_OPTIONS];

  const options = value
    .slice(0, 4)
    .map((item) => (typeof item === "string" ? item : ""));

  while (options.length < 4) {
    options.push("");
  }

  return options;
}

function mapBackendStatus(status?: string): QuestionStatus {
  if (status === "approved") return "approved";
  if (status === "skipped") return "skipped";
  return "pending";
}

function mapFrontendStatus(status: QuestionStatus) {
  if (status === "pending") return "pending_review";
  return status;
}

function mapDifficulty(score?: number | null): Difficulty {
  if (score == null) return "medium";
  if (score <= 0.33) return "easy";
  if (score >= 0.67) return "hard";
  return "medium";
}

function mapDifficultyValue(difficulty: Difficulty) {
  if (difficulty === "easy") return 0.25;
  if (difficulty === "hard") return 0.75;
  return 0.5;
}

function resolveSourcePageIndex(typeSpecificData?: Record<string, unknown>) {
  const manualPageIndex = typeSpecificData?.manual_page_index;
  if (typeof manualPageIndex === "number" && Number.isFinite(manualPageIndex)) {
    return Math.max(0, manualPageIndex);
  }

  const sourcePageIndex = typeSpecificData?.source_page_index;
  if (typeof sourcePageIndex === "number" && Number.isFinite(sourcePageIndex)) {
    return Math.max(0, sourcePageIndex - 1);
  }

  return 0;
}

function extractTagNames(item: { tags?: ApiTag[]; type_specific_data?: Record<string, unknown> }) {
  const relationalTags = (item.tags || []).map((tag) => tag.name);
  const typeSpecificTags = Array.isArray(item.type_specific_data?.tags)
    ? item.type_specific_data.tags
        .map((tag) => (typeof tag === "string" ? tag : ""))
        .filter(Boolean)
    : [];

  return dedupeStrings([...relationalTags, ...typeSpecificTags]);
}

function buildFormData(question: ReviewQuestion | null): ReviewFormData {
  if (!question) {
    return {
      latex: "",
      answer: "",
      options: [...EMPTY_OPTIONS],
      difficulty: "medium",
      tags: [],
      tagInput: "",
    };
  }

  return {
    latex: question.latex,
    answer: question.answer,
    options: [...question.options],
    difficulty: question.difficulty,
    tags: [...question.tags],
    tagInput: "",
  };
}

function toReviewQuestion(
  item: RawPaperQuestionPayload,
  originalUrls: string[],
  fallbackIndex: number,
): ReviewQuestion {
  const typeSpecificData = item.type_specific_data || {};
  const sourcePageIndex = resolveSourcePageIndex(typeSpecificData);
  const cropImages = dedupeStrings([item.image_url, ...(item.crop_urls || [])]);
  const questionImage = cropImages[0] || "";
  const fullPaperImage =
    originalUrls[sourcePageIndex] || originalUrls[0] || questionImage || "";

  return {
    id: item.id,
    problemNumber: (item.problem_number || String(fallbackIndex + 1)).trim(),
    type: item.question_type || "essay",
    status: mapBackendStatus(item.status),
    fullPaperImage,
    questionImage,
    cropImages,
    latex: item.content_latex || "",
    answer: item.answer_latex || "",
    options: normalizeOptions(typeSpecificData.options),
    difficulty: mapDifficulty(item.difficulty),
    tags: extractTagNames(item),
    sourcePageIndex,
    typeSpecificData,
  };
}

function mergePatchedQuestion(
  current: ReviewQuestion,
  payload: QuestionPatchResponse,
  originalUrls: string[],
): ReviewQuestion {
  const typeSpecificData = payload.type_specific_data || current.typeSpecificData;
  const sourcePageIndex = resolveSourcePageIndex(typeSpecificData);
  const fullPaperImage =
    originalUrls[sourcePageIndex] || originalUrls[0] || current.fullPaperImage;

  return {
    ...current,
    problemNumber: (payload.problem_number || current.problemNumber).trim(),
    type: payload.question_type || current.type,
    status: mapBackendStatus(payload.status),
    latex: payload.content_latex || "",
    answer: payload.answer_latex || "",
    options: normalizeOptions(typeSpecificData.options),
    difficulty: mapDifficulty(payload.difficulty),
    tags: extractTagNames({
      tags: payload.tags,
      type_specific_data: typeSpecificData,
    }),
    typeSpecificData,
    fullPaperImage,
    sourcePageIndex,
  };
}

function CarouselImage({
  images,
  index,
  onPrev,
  onNext,
  onSelect,
}: {
  images: string[];
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (nextIndex: number) => void;
}) {
  if (images.length === 0) {
    return <p className="text-sm text-slate-400">暂无可展示图片</p>;
  }

  return (
    <div className="relative h-full w-full">
      <img
        src={images[index]}
        alt="题目图片"
        className="h-full w-full rounded-lg object-contain"
      />

      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/65 p-2 text-white hover:bg-slate-900"
            aria-label="上一张"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-slate-900/65 p-2 text-white hover:bg-slate-900"
            aria-label="下一张"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-slate-900/70 px-3 py-1.5">
            {images.map((_, imageIndex) => (
              <button
                key={imageIndex}
                type="button"
                onClick={() => onSelect(imageIndex)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  imageIndex === index ? "bg-white" : "bg-slate-400 hover:bg-slate-200"
                }`}
                aria-label={`切换到第 ${imageIndex + 1} 张`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AIReviewPage() {
  const params = useParams<{ id: string }>();
  const paperId = params.id;
  const navigateToReviewList = useCallback(() => {
    window.location.assign("/raw-papers");
  }, []);


  const [paperTitle, setPaperTitle] = useState("");
  const [originalUrls, setOriginalUrls] = useState<string[]>([]);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [busyAction, setBusyAction] = useState<BusyAction>("none");
  const [isFinishing, setIsFinishing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [formData, setFormData] = useState<ReviewFormData>(() => buildFormData(null));

  const activeQuestion = questions[activeIndex] ?? null;
  const activeQuestionId = activeQuestion?.id ?? null;
  const carouselImages = activeQuestion?.cropImages ?? [];
  const approvedCount = questions.filter((question) => question.status === "approved").length;
  const totalCount = questions.length;

  const fetchPaper = useCallback(
    async (preferredQuestionId?: number | null) => {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(`/api/raw-papers/${paperId}`, {
          method: "GET",
          cache: "no-store",
        });
        const data = (await response.json().catch(() => ({}))) as RawPaperPayload;
        if (!response.ok) {
          throw new Error(data.detail || `加载失败 (HTTP ${response.status})`);
        }

        const nextOriginalUrls = data.original_urls || [];
        const nextQuestions = (data.questions || []).map((question, index) =>
          toReviewQuestion(question, nextOriginalUrls, index)
        );

        setPaperTitle(data.title || "");
        setOriginalUrls(nextOriginalUrls);
        setQuestions(nextQuestions);
        setActiveIndex((currentIndex) => {
          if (nextQuestions.length === 0) return 0;

          if (preferredQuestionId != null) {
            const preferredIndex = nextQuestions.findIndex(
              (question) => question.id === preferredQuestionId,
            );
            if (preferredIndex >= 0) return preferredIndex;
          }

          return clamp(currentIndex, 0, Math.max(nextQuestions.length - 1, 0));
        });
      } catch (error) {
        setQuestions([]);
        setPaperTitle("");
        setOriginalUrls([]);
        setLoadError(error instanceof Error ? error.message : "加载失败");
      } finally {
        setLoading(false);
      }
    },
    [paperId],
  );

  useEffect(() => {
    void fetchPaper();
  }, [fetchPaper]);

  useEffect(() => {
    setFormData(buildFormData(activeQuestion));
    setCarouselIndex(0);
    setIsCropModalOpen(false);
  }, [activeQuestionId]);

  const handleAddTag = () => {
    if (formData.tagInput.trim() && !formData.tags.includes(formData.tagInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, prev.tagInput.trim()],
        tagInput: "",
      }));
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((currentTag) => currentTag !== tag),
    }));
  };

  const handlePreviousQuestion = () => {
    setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
  };

  const handleSelectQuestion = (index: number) => {
    setActiveIndex(index);
    setActionError("");
  };

  const ensureTagIds = useCallback(async (tagNames: string[]) => {
    const normalizedNames = dedupeStrings(tagNames);
    if (normalizedNames.length === 0) return [] as number[];

    const listResponse = await fetch(`/api/tags?size=${normalizedNames.length + 100}`, {
      method: "GET",
      cache: "no-store",
    });
    const listData = (await listResponse.json().catch(() => ({}))) as TagsListResponse;
    if (!listResponse.ok) {
      throw new Error(listData.detail || `标签加载失败 (HTTP ${listResponse.status})`);
    }

    const tagIdByName = new Map((listData.items || []).map((tag) => [tag.name, tag.id]));
    const tagIds: number[] = [];

    for (const tagName of normalizedNames) {
      let tagId = tagIdByName.get(tagName);

      if (!tagId) {
        const createResponse = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: tagName,
            category: "knowledge",
          }),
        });
        const createData = (await createResponse.json().catch(() => ({}))) as ApiTag & {
          detail?: string;
        };

        if (!createResponse.ok) {
          throw new Error(createData.detail || `标签创建失败 (HTTP ${createResponse.status})`);
        }

        tagId = createData.id;
        tagIdByName.set(tagName, tagId);
      }

      tagIds.push(tagId);
    }

    return tagIds;
  }, []);

  const persistQuestion = useCallback(
    async (nextStatus: QuestionStatus) => {
      if (!activeQuestion) return;

      setBusyAction("save");
      setActionError("");

      try {
        const tagIds = await ensureTagIds(formData.tags);
        const payload = {
          problem_number: activeQuestion.problemNumber,
          question_type: activeQuestion.type,
          content_latex: formData.latex.trim(),
          answer_latex: formData.answer.trim() || null,
          difficulty: mapDifficultyValue(formData.difficulty),
          status: mapFrontendStatus(nextStatus),
          type_specific_data: {
            ...activeQuestion.typeSpecificData,
            options: formData.options,
            tags: formData.tags,
          },
          tag_ids: tagIds,
        };

        const response = await fetch(`/api/questions/${activeQuestion.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json().catch(() => ({}))) as QuestionPatchResponse;
        if (!response.ok) {
          throw new Error(data.detail || `保存失败 (HTTP ${response.status})`);
        }

        const updatedQuestion = mergePatchedQuestion(activeQuestion, data, originalUrls);
        setQuestions((currentQuestions) =>
          currentQuestions.map((question) =>
            question.id === activeQuestion.id ? updatedQuestion : question,
          ),
        );
        setActiveIndex((currentIndex) =>
          Math.min(currentIndex + 1, Math.max(questions.length - 1, 0)),
        );
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "保存失败");
      } finally {
        setBusyAction("none");
      }
    },
    [activeQuestion, ensureTagIds, formData, originalUrls, questions.length],
  );

  const handleRerunOCROnly = () => {
    setActionError("当前后端未提供单题重新识别接口，页面已改为真实数据读取与保存。");
  };

  const handleCropSuccess = useCallback(
    async (result: { question_id: number }) => {
      setActionError("");
      await fetchPaper(result.question_id);
    },
    [fetchPaper],
  );

  const handleExitReview = () => {
    navigateToReviewList();
  };

  const handleFinishAndExit = async () => {
    setIsFinishing(true);
    setActionError("");

    try {
      const response = await fetch(`/api/raw-papers/${paperId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });
      const data = (await response.json().catch(() => ({}))) as { detail?: string };

      if (!response.ok) {
        throw new Error(data.detail || `更新试卷状态失败 (HTTP ${response.status})`);
      }

      navigateToReviewList();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "更新试卷状态失败");
      setIsFinishing(false);
    }
  };

  const renderStatusIndicator = (status: QuestionStatus) => {
    if (status === "approved") {
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    }
    if (status === "skipped") {
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
    return <Circle className="h-4 w-4 text-slate-400" />;
  };

  const workspaceContent = useMemo(() => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载真实题目数据...
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      );
    }

    return null;
  }, [loadError, loading]);

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden bg-slate-100">
      <div className="flex h-full flex-col">
        <header className="h-16 shrink-0 border-b border-slate-200 bg-white px-5">
          <div className="flex h-full items-center justify-between">
            <button
              type="button"
              onClick={handleExitReview}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              退出校验
            </button>

            <div className="text-center">
              <p className="text-xs font-medium text-slate-500">当前进度</p>
              <p className="text-sm font-semibold text-slate-900">
                已审 {approvedCount}/{totalCount || 0}
              </p>
            </div>

            <button
              type="button"
              onClick={handleFinishAndExit}
              disabled={isFinishing}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFinishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isFinishing ? "提交中..." : "完成并退出"}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-[280px] shrink-0 border-r border-slate-200 bg-slate-50">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  题目导航
                </p>
                <p className="mt-1 text-xs text-slate-400">试卷 ID: {paperId}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{paperTitle || "-"}</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {loading || loadError ? (
                  workspaceContent
                ) : questions.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                    当前试卷暂无可审核题目
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {questions.map((question, index) => {
                      const isActive = index === activeIndex;
                      return (
                        <li key={question.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectQuestion(index)}
                            className={`group relative flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition ${
                              isActive
                                ? "border-blue-200 bg-blue-100"
                                : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {isActive ? (
                              <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-blue-600" />
                            ) : null}
                            <span className="pl-2 text-sm font-medium text-slate-700">
                              第 {question.problemNumber} 题 - {question.type}
                            </span>
                            <span>{renderStatusIndicator(question.status)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </aside>

          <section className="flex min-w-0 basis-1/2 items-center justify-center border-r border-slate-700 bg-slate-900 p-6">
            <div className="flex h-full w-full max-w-none flex-col rounded-2xl border border-slate-700 bg-slate-800/80 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-300">
                  <p className="text-sm font-medium">原图阅览区</p>
                </div>

                {activeQuestion ? (
                  <div className="rounded-lg border border-slate-600 bg-slate-900/70 p-1">
                    <button
                      type="button"
                      onClick={() => setIsCropModalOpen(true)}
                      disabled={!activeQuestion || !activeQuestion.fullPaperImage}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-60"
                    >
                      <Scissors className="h-3.5 w-3.5" />
                      手工重切
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex min-h-[420px] flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-600 bg-slate-800">
                {!activeQuestion ? (
                  <p className="text-sm text-slate-400">暂无题目</p>
                ) : (
                  <CarouselImage
                    images={carouselImages}
                    index={carouselIndex}
                    onPrev={() =>
                      setCarouselIndex(
                        (currentIndex) =>
                          (currentIndex - 1 + carouselImages.length) % carouselImages.length,
                      )
                    }
                    onNext={() =>
                      setCarouselIndex(
                        (currentIndex) => (currentIndex + 1) % carouselImages.length,
                      )
                    }
                    onSelect={setCarouselIndex}
                  />
                )}
              </div>
            </div>
          </section>

          <section className="min-w-0 basis-1/2 shrink-0 bg-white">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-6 py-4">
                <p className="text-sm font-semibold text-slate-900">
                  数据编辑 - 第 {activeQuestion?.problemNumber ?? "-"} 题
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  当前题目 ID: {activeQuestionId ?? "-"}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-6">
                  {actionError ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {actionError}
                    </div>
                  ) : null}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleRerunOCROnly}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                      单题重识别暂未接入
                    </button>
                  </div>

                  <QuestionStemEditorPanel
                    value={formData.latex}
                    disabled={!activeQuestion}
                    onChange={(nextValue) =>
                      setFormData((previous) => ({
                        ...previous,
                        latex: nextValue,
                      }))
                    }
                  />

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">参考答案</label>
                    <textarea
                      value={formData.answer}
                      onChange={(event) =>
                        setFormData((previous) => ({
                          ...previous,
                          answer: event.target.value,
                        }))
                      }
                      rows={3}
                      disabled={!activeQuestion}
                      className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                      placeholder="答案（如有）"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">选项</label>
                    <div className="space-y-2">
                      {(["A", "B", "C", "D"] as const).map((option) => (
                        <input
                          key={option}
                          type="text"
                          value={formData.options[option.charCodeAt(0) - 65] ?? ""}
                          onChange={(event) => {
                            const optionIndex = option.charCodeAt(0) - 65;
                            setFormData((previous) => {
                              const nextOptions = [...previous.options];
                              nextOptions[optionIndex] = event.target.value;
                              return {
                                ...previous,
                                options: nextOptions,
                              };
                            });
                          }}
                          disabled={!activeQuestion}
                          placeholder={`选项 ${option}`}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">难度等级</label>
                    <select
                      value={formData.difficulty}
                      onChange={(event) =>
                        setFormData((previous) => ({
                          ...previous,
                          difficulty: event.target.value as Difficulty,
                        }))
                      }
                      disabled={!activeQuestion}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                    >
                      <option value="easy">简单</option>
                      <option value="medium">中等</option>
                      <option value="hard">困难</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">知识点标签</label>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {formData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="text-cyan-500 transition hover:text-cyan-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.tagInput}
                        onChange={(event) =>
                          setFormData((previous) => ({
                            ...previous,
                            tagInput: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddTag();
                          }
                        }}
                        disabled={!activeQuestion}
                        placeholder="输入标签后按 Enter"
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        disabled={!activeQuestion}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-50"
                      >
                        添加
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-800">知识点大纲</label>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                      第一章 &gt; 第一节 &gt; 知识点 A（待接知识图谱选择器）
                    </div>
                  </div>
                </div>
              </div>

              <footer className="shrink-0 border-t border-slate-200 bg-white px-6 py-3 shadow-[0_-6px_20px_rgba(15,23,42,0.05)]">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handlePreviousQuestion}
                    disabled={activeIndex === 0 || totalCount === 0 || busyAction !== "none"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一题
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void persistQuestion("skipped")}
                      disabled={!activeQuestion || busyAction !== "none"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                    >
                      {busyAction === "save" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <SkipForward className="h-4 w-4" />
                      )}
                      暂时跳过
                    </button>
                    <button
                      type="button"
                      onClick={() => void persistQuestion("approved")}
                      disabled={!activeQuestion || busyAction !== "none"}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busyAction === "save" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      审核通过
                    </button>
                  </div>
                </div>
              </footer>
            </div>
          </section>
        </div>
      </div>

      <ManualCropModal
        open={isCropModalOpen}
        paperId={paperId}
        originalUrls={originalUrls}
        initialProblemNumber={activeQuestion?.problemNumber ?? ""}
        initialPageIndex={activeQuestion?.sourcePageIndex ?? 0}
        onClose={() => setIsCropModalOpen(false)}
        onSuccess={(result) => void handleCropSuccess(result)}
      />
    </div>
  );
}
