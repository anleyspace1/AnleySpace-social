/**
 * Validates new marketplace listing input before POST.
 * Returns `null` if valid, or an alert message if invalid.
 */
export function validateNewListingFields(image: string, title: string, description: string): string | null {
  if (!image || image.trim() === '') {
    return 'Product image is required';
  }
  if (!title || title.trim() === '') {
    return 'Product title is required';
  }
  if (!description || description.trim() === '') {
    return 'Product description is required';
  }
  return null;
}
