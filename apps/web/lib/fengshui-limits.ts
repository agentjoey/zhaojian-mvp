/**
 * 风水（「境」）功能的数量上限。**单一事实源**——服务端校验与客户端选择器共用同一个
 * 常量，不各写一份字面量。
 *
 * ⚠️ 这个模块必须保持零依赖（不 import supabase / core / react）：它同时被 Node
 * 运行时的路由（`app/api/fengshui/reading/route.ts`）与浏览器组件
 * （`app/fengshui/DwellingForm.tsx`、`app/fengshui/page.tsx`）import。把它挂到
 * `lib/dwellings.ts` 之类的模块上会顺带把 `"use client"` 的 supabase 浏览器客户端
 * 拖进服务端路由的模块图里。
 */

/**
 * 同住人（合看）数量上限。
 *
 * 服务端理由（Task 9，复审 Minor）：每个同住人服务端都要用 `computeUnifiedChart`
 * 现算一次完整命盘（紫微+八字+西盘）——公开端点若不设上限，N 个同住人就是 N 次
 * 重排盘，是一个廉价的放大攻击面。8 是留了充分余量的保守上限（正常使用场景里
 * 「同住人」数量远小于此）。
 *
 * 客户端理由（最终评审 I1）：上限只存在于服务端时，用户可以在选择器里勾 9 个人、
 * 存下来，此后**每次**加载 /fengshui 都被 Zod 打成 400 → 「叙述暂时生成不出来」+
 * 一个永远不可能成功的重试按钮，且无从把失败与同住人列表联系起来。上限必须在
 * 用户能改的那一头就可见、可执行，服务端校验只是最后一道防线。
 */
export const MAX_COHABITANTS = 8;
