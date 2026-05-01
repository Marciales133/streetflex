import Notification from "../models/Notification.js";

// =============================================================================
// GET NOTIFICATIONS  (customer)
// =============================================================================
/**
 * GET /api/auth/notifications?page=1&limit=20
 *
 * Returns the current user's notifications, newest first.
 * Unread count is included so the nav badge can be updated without
 * a separate request.
 *
 * Response 200:
 *   {
 *     notifications: [...],
 *     unread_count: <number>,
 *     pagination: { total, page, limit, total_pages, has_next, has_prev }
 *   }
 */
async function getNotifications(req, res) {
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const page  = Math.max(1,  parseInt(req.query.page)  || 1);
    const skip  = (page - 1) * limit;

    try {
        const filter = { user_id: req.user._id };

        const [notifications, total, unread_count] = await Promise.all([
            Notification.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments(filter),
            Notification.countDocuments({ user_id: req.user._id, is_read: false }),
        ]);

        return res.status(200).json({
            notifications,
            unread_count,
            pagination: {
                total,
                page,
                limit,
                total_pages: Math.ceil(total / limit),
                has_next:    page < Math.ceil(total / limit),
                has_prev:    page > 1,
            },
        });

    } catch (err) {
        console.error("[getNotifications]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// MARK ONE READ
// =============================================================================
/**
 * PATCH /api/auth/notifications/:id/read
 *
 * Marks a single notification as read.
 * Only the owner can mark their own notifications.
 *
 * Response 200: { message, unread_count }
 */
async function markOneRead(req, res) {
    try {
        const notif = await Notification.findOne({
            _id:     req.params.id,
            user_id: req.user._id,
        });

        if (!notif) {
            return res.status(404).json({ message: "Notification not found." });
        }

        if (!notif.is_read) {
            notif.is_read = true;
            await notif.save();
        }

        const unread_count = await Notification.countDocuments({
            user_id: req.user._id,
            is_read: false,
        });

        return res.status(200).json({ message: "Marked as read.", unread_count });

    } catch (err) {
        console.error("[markOneRead]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

// =============================================================================
// MARK ALL READ
// =============================================================================
/**
 * PATCH /api/auth/notifications/read-all
 *
 * Marks every unread notification for this user as read in one operation.
 *
 * Response 200: { message, updated_count }
 */
async function markAllRead(req, res) {
    try {
        const result = await Notification.updateMany(
            { user_id: req.user._id, is_read: false },
            { $set:    { is_read: true } }
        );

        return res.status(200).json({
            message:       "All notifications marked as read.",
            updated_count: result.modifiedCount,
        });

    } catch (err) {
        console.error("[markAllRead]", err);
        return res.status(500).json({ message: "Something went wrong." });
    }
}

export { getNotifications, markOneRead, markAllRead };