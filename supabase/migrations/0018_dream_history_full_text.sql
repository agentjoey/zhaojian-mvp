-- EP-dream-history-2 · 解梦历史支持续追问
--
-- owner 决策（2026-08-21）：只存摘要（summary）会让「点历史条目续追问」的模型只能
-- 拿到一句 160 字的转述，续得上但保真度打折。owner 明确要求「接着原话聊」——但
-- 红线仍然是「梦原文不落库」（spec §5.1）：不存用户打的梦原文，但灵自己生成的
-- 解读全文可以存（灵的输出已经过 sanitizeDream/sanitizeReading/correctMutagens
-- 全套后置链，不是用户的原始陈述）。续接历史时用这段解读全文当锚点喂回模型
-- （"你之前对这个人说过……现在他们追问：……"），不需要重建"用户讲了个梦"这句
-- 首轮 prompt，因此也不需要梦原文。
--
-- 可为空：迁移前已写入的行（只有 summary）不支持"接着原话聊"续接，只能当作
-- 摘要展示——降级而非报错。

alter table public.dream_history
  add column if not exists full_text text;
