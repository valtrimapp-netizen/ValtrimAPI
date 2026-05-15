import { extractItemsFromVisionTask } from './anthropicVisionClient.js';

export async function runVisionTasks(tasks, options = {}) {
  const tileResults = [];
  const apiErrors = [];

  for (const task of Array.isArray(tasks) ? tasks : []) {
    try {
      const items = await extractItemsFromVisionTask(task, options);
      tileResults.push({
        page: task.page,
        tileId: task.tileId || task.tile?.id,
        bbox: task.bbox || task.tile?.bbox,
        pass: task.pass || 0,
        focusCategories: task.focusCategories || [],
        items,
      });
    } catch (error) {
      if (options.onApiError === 'fail') throw error;
      apiErrors.push({
        page: task.page,
        tileId: task.tileId || task.tile?.id,
        pass: task.pass || 0,
        focusCategories: task.focusCategories || [],
        error: error.message,
      });
    }
  }

  return { tileResults, apiErrors };
}
