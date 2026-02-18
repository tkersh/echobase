/**
 * Handles the health check request.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 */
async function getHealth(req, res, next) {
    try {
        const health = await req.services.healthService.getHealthStatus();
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getHealth,
};
