"use client";

import { useState } from "react";
import { Check, Lock, Loader2, X, AlertCircle } from "lucide-react";

/**
 * 试卷处理流水线工作台 (Pipeline Workspace)
 * 线性状态机：1 → 2 → 3 → 4
 * - Step 1: 自动切图
 * - Step 2: 切图质检
 * - Step 3: OCR识别
 * - Step 4: 人工校验
 */

enum PipelineStep {
  AutoCrop = 1,
  QualityCheck = 2,
  OCRRecognition = 3,
  ManualAudit = 4,
}

const STEP_LABELS = {
  [PipelineStep.AutoCrop]: "自动切图",
  [PipelineStep.QualityCheck]: "切图质检",
  [PipelineStep.OCRRecognition]: "OCR识别",
  [PipelineStep.ManualAudit]: "人工校验",
};

export default function PipelineWorkspace() {
  const [currentStep, setCurrentStep] = useState<PipelineStep>(
    PipelineStep.QualityCheck
  );

  // 模拟 AI 处理时触发自动跳步
  const handleConfirmQuality = () => {
    setCurrentStep(PipelineStep.OCRRecognition);
    // 模拟 2 秒后 OCR 处理完成，自动跳到人工校验
    setTimeout(() => {
      setCurrentStep(PipelineStep.ManualAudit);
    }, 2000);
  };

  const handleAuditPass = () => {
    alert("✅ 成功！该试题已审核通过并入库。");
    // 实际应用中应该调用 API
  };

  const handleSaveDraft = () => {
    alert("💾 草稿已保存");
    // 实际应用中应该调用 API
  };

  const handleReject = () => {
    alert("🔄 请重新上传试卷进行切图");
    // 实际应用中应该跳转或清空状态
  };

  // ==================== 顶部步骤条 ====================
  const renderStepper = () => {
    const steps = [
      PipelineStep.AutoCrop,
      PipelineStep.QualityCheck,
      PipelineStep.OCRRecognition,
      PipelineStep.ManualAudit,
    ];

    return (
      <div className="flex items-center justify-start gap-8">
        {steps.map((step, index) => {
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;
          const isFuture = step > currentStep;

          return (
            <div key={step} className="flex items-center gap-3">
              {/* 步骤圆圈 */}
              <div
                className={`relative w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all ${
                  isCompleted
                    ? "bg-emerald-100"
                    : isCurrent
                      ? "bg-blue-100 ring-2 ring-blue-400"
                      : "bg-gray-100"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-6 h-6 text-emerald-600" />
                ) : isCurrent ? (
                  <span className="text-blue-600 font-bold">{step}</span>
                ) : (
                  <Lock className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {/* 步骤标签 */}
              <div className="flex flex-col">
                <span
                  className={`text-sm font-medium ${
                    isCompleted
                      ? "text-gray-400"
                      : isCurrent
                        ? "text-blue-600 font-bold"
                        : "text-gray-400"
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>

              {/* 连接线 */}
              {index < steps.length - 1 && (
                <div
                  className={`h-1 w-16 mx-2 rounded ${
                    isCompleted ? "bg-emerald-300" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ==================== 中部工作区 ====================
  const renderMiddleWorkspace = () => {
    // Step 1 & 3: AI 处理中
    if (
      currentStep === PipelineStep.AutoCrop ||
      currentStep === PipelineStep.OCRRecognition
    ) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
            </div>
            <p className="text-lg font-semibold text-gray-700 mb-2">
              {currentStep === PipelineStep.AutoCrop
                ? "自动切图中..."
                : "AI 正在作业中..."}
            </p>
            <p className="text-sm text-gray-500">
              请耐心等待，系统正在处理中
            </p>
          </div>
        </div>
      );
    }

    // Step 2: 切图质检 (4:6 分栏)
    if (currentStep === PipelineStep.QualityCheck) {
      return (
        <div className="h-full flex gap-6">
          {/* 左侧：原图 */}
          <div className="w-2/5 flex flex-col">
            <div className="flex-1 bg-gray-300 rounded-lg border-2 border-gray-400 flex items-center justify-center overflow-hidden">
              <div className="text-center text-gray-500">
                <img
                  src="https://via.placeholder.com/400x600/e5e7eb/9ca3af?text=试卷原图"
                  alt="原图"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <p className="mt-2 text-sm text-gray-600 font-medium">试卷原图</p>
          </div>

          {/* 右侧：切图网格 */}
          <div className="w-3/5 flex flex-col">
            <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 overflow-auto">
              <p className="mb-4 text-sm font-semibold text-gray-700">
                切下的题目集 (6 题)
              </p>
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="relative group rounded-lg border border-gray-200 bg-gray-100 overflow-hidden aspect-video hover:shadow-lg transition-shadow"
                  >
                    <img
                      src={`https://via.placeholder.com/200x120/f3f4f6/d1d5db?text=题目${index + 1}`}
                      alt={`题目 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* 删除按钮 */}
                    <button
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      title="删除此题目"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Step 4: 人工校验 (5:5 分栏)
    if (currentStep === PipelineStep.ManualAudit) {
      return (
        <div className="h-full flex gap-6">
          {/* 左侧：单题原图 */}
          <div className="w-2/5 flex flex-col">
            <div className="flex-1 bg-gray-300 rounded-lg border-2 border-gray-400 flex items-center justify-center overflow-hidden">
              <img
                src="https://via.placeholder.com/400x500/e5e7eb/9ca3af?text=单题原图"
                alt="单题原图"
                className="w-full h-full object-cover"
              />
            </div>
            <p className="mt-2 text-sm text-gray-600 font-medium">单题原图</p>
          </div>

          {/* 右侧：编辑表单 */}
          <div className="w-3/5 flex flex-col">
            <div className="flex-1 bg-white rounded-lg border border-gray-200 p-6 overflow-auto">
              <p className="mb-6 text-lg font-semibold text-gray-800">
                试题编辑
              </p>

              {/* LaTeX 文本框 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LaTeX 题目文本
                </label>
                <textarea
                  defaultValue="$$\int_0^{\pi} \sin(x) dx = ?$$"
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="输入 LaTeX 格式的题目..."
                />
              </div>

              {/* 难度选择 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  难度等级
                </label>
                <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                  <option>简单</option>
                  <option selected>中等</option>
                  <option>难</option>
                  <option>非常难</option>
                </select>
              </div>

              {/* 知识点标签 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  知识点标签
                </label>
                <div className="flex flex-wrap gap-2">
                  {["求导", "定积分", "参数方程", "极坐标"].map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-sm font-medium flex items-center gap-1"
                    >
                      {tag}
                      <button className="hover:text-cyan-900">×</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="添加新标签，按 Enter 确认"
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 错误提示（示例）*/}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    OCR 识别有疑议
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    第 2 个字符识别置信度低，请仔细核实。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  // ==================== 底部操作栏 ====================
  const renderBottomActionBar = () => {
    // Step 1 & 3: 不渲染任何按钮
    if (
      currentStep === PipelineStep.AutoCrop ||
      currentStep === PipelineStep.OCRRecognition
    ) {
      return null;
    }

    // Step 2: 驳回重切 + 确认无误发起 OCR
    if (currentStep === PipelineStep.QualityCheck) {
      return (
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleReject}
            className="px-6 py-2 border-2 border-red-500 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
          >
            驳回重切
          </button>
          <button
            onClick={handleConfirmQuality}
            className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            确认无误，发起 OCR
          </button>
        </div>
      );
    }

    // Step 4: 保存草稿 + 审核通过并入库
    if (currentStep === PipelineStep.ManualAudit) {
      return (
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleSaveDraft}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            保存草稿
          </button>
          <button
            onClick={handleAuditPass}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            审核通过并入库
          </button>
        </div>
      );
    }

    return null;
  };

  // ==================== 主体结构 ====================
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-gray-50">
      {/* 顶部：步骤条 */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white shadow-sm">
        {renderStepper()}
      </div>

      {/* 中部：工作区（可滚动）*/}
      <div className="flex-1 overflow-auto">
        <div className="p-6">{renderMiddleWorkspace()}</div>
      </div>

      {/* 底部：操作栏（吸底固定）*/}
      <div className="sticky bottom-0 px-6 py-4 border-t border-gray-200 bg-white shadow-lg">
        {renderBottomActionBar()}
      </div>
    </div>
  );
}
