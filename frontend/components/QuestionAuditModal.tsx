'use client';

import React, { useState } from 'react';
import { X, Image } from 'lucide-react';

interface QuestionAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QuestionAuditModal: React.FC<QuestionAuditModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // State for form fields
  const [questionNumber, setQuestionNumber] = useState('1');
  const [questionType, setQuestionType] = useState('单选题');
  const [questionStem, setQuestionStem] = useState('求解积分 \\int_{0}^{\\pi} \\sin(x) dx');
  const [options, setOptions] = useState({ A: '', B: '', C: '', D: '' });
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [tags, setTags] = useState<string[]>(['积分', '三角函数']);
  const [difficulty, setDifficulty] = useState('中等');
  const [newTag, setNewTag] = useState('');

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-[90vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-xl font-semibold">题目精修与审核</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-2 gap-6 p-6 overflow-hidden">
          {/* Left: Original Image */}
          <div className="flex flex-col">
            <h3 className="text-lg font-medium mb-4">AI 切图原件</h3>
            <div className="flex-1 bg-gray-200 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Image size={48} className="mx-auto mb-2 text-gray-500" />
                <p className="text-gray-600">原题物理切图展示区</p>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="flex flex-col overflow-y-auto">
            <div className="space-y-4">
              {/* Question Number and Type */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">题号</label>
                  <input
                    type="text"
                    value={questionNumber}
                    onChange={(e) => setQuestionNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">题型</label>
                  <select
                    value={questionType}
                    onChange={(e) => setQuestionType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option>单选题</option>
                    <option>填空题</option>
                    <option>解答题</option>
                  </select>
                </div>
              </div>

              {/* Question Stem */}
              <div>
                <label className="block text-sm font-medium mb-1">题干 LaTeX 内容</label>
                <textarea
                  value={questionStem}
                  onChange={(e) => setQuestionStem(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Options if multiple choice */}
              {questionType === '单选题' && (
                <div>
                  <label className="block text-sm font-medium mb-1">选项录入</label>
                  <div className="space-y-2">
                    {['A', 'B', 'C', 'D'].map((opt) => (
                      <input
                        key={opt}
                        type="text"
                        placeholder={`选项 ${opt}`}
                        value={options[opt as keyof typeof options]}
                        onChange={(e) => setOptions({ ...options, [opt]: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Correct Answer */}
              <div>
                <label className="block text-sm font-medium mb-1">正确答案</label>
                <input
                  type="text"
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1">知识点标签</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="输入标签"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    添加
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <span key={tag} className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm flex items-center gap-1">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="text-blue-600 hover:text-blue-800">×</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <label className="block text-sm font-medium mb-1">预估难度</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option>简单</option>
                  <option>中等</option>
                  <option>困难</option>
                </select>
              </div>

              {/* LaTeX Preview */}
              <div>
                <label className="block text-sm font-medium mb-1">LaTeX 实时预览</label>
                <div className="bg-gray-50 p-4 rounded-md border">
                  <p className="text-gray-600">这里未来将接入 KaTeX 渲染公式</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-4 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600">
            取消
          </button>
          <button className="px-4 py-2 border border-blue-500 text-blue-500 rounded-md hover:bg-blue-50">
            保存草稿
          </button>
          <button className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">
            审核通过并入库
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuestionAuditModal;