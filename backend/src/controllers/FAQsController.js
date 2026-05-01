import { FaqQuestion, Notification } from "../models/modelCenter.js";

// =============================================================================
// HELPERS
// =============================================================================
async function createNotification(user_id, type, message, ref_type, ref_id) {
    await Notification.create({ user_id, type, message, ref_type, ref_id });
}

// =============================================================================
// GET ALL QUESTIONS
// =============================================================================
/**
 * GET /api/auth/faqs
 * Returns all non-deleted questions, oldest first.
 * Populates the asking user's display_name and avatar.
 */
async function getQuestions(req, res) {
    try {
        const questions = await FaqQuestion.find({ deleted_at: null })
            .populate("user_id", "email profile.display_name profile.avatar_url")
            .populate("answer.answered_by", "profile.display_name")
            .sort({ createdAt: 1 });

        return res.status(200).json({ questions });
    } catch (err) {
        console.error("[getQuestions]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// ANSWER A QUESTION
// =============================================================================
/**
 * POST /api/auth/faqs/:id/answer
 *
 * Body: text (required)
 *
 * - Sets answer embedded doc
 * - Sends faq_answered notification to the question owner
 */
async function answerQuestion(req, res) {
    const { text } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ message: "Answer text is required." });
    }

    try {
        const question = await FaqQuestion.findOne({
            _id: req.params.id,
            deleted_at: null,
        });

        if (!question) {
            return res.status(404).json({ message: "Question not found." });
        }
        if (question.answer && !question.answer.is_deleted) {
            return res.status(400).json({
                message: "Question is already answered. Use the edit endpoint instead.",
            });
        }

        question.answer = {
            text:        text.trim(),
            answered_by: req.user._id,
            is_deleted:  false,
            updated_at:  new Date(),
        };

        await question.save();

        await createNotification(
            question.user_id,
            "faq_answered",
            `Your question has been answered: "${text.trim()}"`,
            "faqquestions",
            question._id
        );

        return res.status(200).json({
            message:  "Question answered successfully.",
            question,
        });
    } catch (err) {
        console.error("[answerQuestion]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// EDIT AN ANSWER
// =============================================================================
/**
 * PATCH /api/auth/faqs/:id/answer
 *
 * Body: text (required)
 *
 * - Updates answer.text and answer.updated_at
 * - Sends a second faq_answered notification indicating the answer was updated
 */
async function editAnswer(req, res) {
    const { text } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ message: "Answer text is required." });
    }

    try {
        const question = await FaqQuestion.findOne({
            _id: req.params.id,
            deleted_at: null,
        });

        if (!question) {
            return res.status(404).json({ message: "Question not found." });
        }
        if (!question.answer || question.answer.is_deleted) {
            return res.status(400).json({
                message: "No existing answer to edit. Use the answer endpoint instead.",
            });
        }

        question.answer.text        = text.trim();
        question.answer.answered_by = req.user._id;
        question.answer.updated_at  = new Date();

        await question.save();

        await createNotification(
            question.user_id,
            "faq_answered",
            `The answer to your question has been updated: "${text.trim()}"`,
            "faqquestions",
            question._id
        );

        return res.status(200).json({
            message:  "Answer updated successfully.",
            question,
        });
    } catch (err) {
        console.error("[editAnswer]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// TOGGLE VISIBILITY
// =============================================================================
/**
 * PATCH /api/auth/faqs/:id/visibility
 *
 * Flips is_visible between true and false.
 */
async function toggleVisibility(req, res) {
    try {
        const question = await FaqQuestion.findOne({
            _id: req.params.id,
            deleted_at: null,
        });

        if (!question) {
            return res.status(404).json({ message: "Question not found." });
        }

        question.is_visible = !question.is_visible;
        await question.save();

        return res.status(200).json({
            message:    `Question is now ${question.is_visible ? "visible" : "hidden"}.`,
            is_visible: question.is_visible,
        });
    } catch (err) {
        console.error("[toggleVisibility]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// UPDATE TAGS
// =============================================================================
/**
 * PATCH /api/auth/faqs/:id/tags
 *
 * Body: tags (array of strings, replaces existing tags entirely)
 */
async function updateTags(req, res) {
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
        return res.status(400).json({ message: "tags must be an array of strings." });
    }

    try {
        const question = await FaqQuestion.findOne({
            _id: req.params.id,
            deleted_at: null,
        });

        if (!question) {
            return res.status(404).json({ message: "Question not found." });
        }

        // sanitize: trim, lowercase, deduplicate
        question.tags = [...new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean))];
        await question.save();

        return res.status(200).json({
            message: "Tags updated.",
            tags:    question.tags,
        });
    } catch (err) {
        console.error("[updateTags]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// SOFT DELETE
// =============================================================================
/**
 * DELETE /api/auth/faqs/:id
 *
 * Sets deleted_at — question disappears from all views.
 */
async function deleteQuestion(req, res) {
    try {
        const question = await FaqQuestion.findOne({
            _id: req.params.id,
            deleted_at: null,
        });

        if (!question) {
            return res.status(404).json({ message: "Question not found." });
        }

        question.deleted_at = new Date();
        await question.save();

        return res.status(200).json({ message: "Question deleted." });
    } catch (err) {
        console.error("[deleteQuestion]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}

// =============================================================================
// SUBMIT QUESTION (customer-facing)
// =============================================================================
/**
 * POST /api/auth/faqs
 *
 * Body: question (required), tags (optional array of strings)
 *
 * - Only registered users (not guests) can submit questions
 */
async function submitQuestion(req, res) {
    const { question, tags } = req.body;

    if (!question || !question.trim()) {
        return res.status(400).json({ message: "Question text is required." });
    }

    if (req.user.role === "guest") {
        return res.status(403).json({ message: "Guests cannot submit questions. Please register first." });
    }

    try {
        const newQuestion = await FaqQuestion.create({
            user_id:    req.user._id,
            question:   question.trim(),
            tags:       Array.isArray(tags)
                            ? [...new Set(tags.map(t => t.trim().toLowerCase()).filter(Boolean))]
                            : [],
            is_visible: true,
            deleted_at: null,
        });

        return res.status(201).json({
            message:  "Question submitted successfully.",
            question: newQuestion,
        });
    } catch (err) {
        console.error("[submitQuestion]", err);
        return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
}



async function getMyQuestions(req, res) {
    if (req.user.role === "guest") {
        return res.status(200).json({ questions: [] });
    }
 
    try {
        const questions = await FaqQuestion.find({
            user_id:    req.user._id,
            deleted_at: null,
        })
        .select("_id question tags is_visible answer createdAt")
        .sort({ createdAt: -1 })
        .lean();
 
        // Shape answer — only expose text + updated_at, not internal fields
        const shaped = questions.map(q => ({
            _id:        q._id,
            question:   q.question,
            tags:       q.tags,
            is_visible: q.is_visible,
            createdAt:  q.createdAt,
            answer:     q.answer && !q.answer.is_deleted
                ? { text: q.answer.text, updated_at: q.answer.updated_at }
                : null,
        }));
 
        return res.status(200).json({ questions: shaped });
 
    } catch (err) {
        console.error("[getMyQuestions]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}



export {
    getQuestions,
    answerQuestion,
    editAnswer,
    toggleVisibility,
    updateTags,
    deleteQuestion,
    submitQuestion,
    getMyQuestions
};