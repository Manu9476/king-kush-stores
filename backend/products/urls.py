# backend/products/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # The route for all products: http://127.0.0.1:8000/api/products/
    path('', views.get_products, name='product-list'),
    path('categories/', views.get_categories, name='category-list'),
    path('<int:product_id>/reviews/', views.product_reviews, name='product-reviews'),
    path('reviews/<int:review_id>/', views.product_review_detail, name='product-review-detail'),
    path('reviews/<int:review_id>/comments/', views.product_review_comments, name='product-review-comments'),
    path('review-comments/<int:comment_id>/', views.product_review_comment_detail, name='product-review-comment-detail'),
    path('vendor/dashboard/', views.vendor_dashboard_summary, name='vendor-dashboard-summary'),
    path('vendor/products/', views.vendor_products, name='vendor-products'),
    path('vendor/products/bulk-import/', views.vendor_products_bulk_import, name='vendor-products-bulk-import'),
    path('vendor/products/<int:product_id>/', views.vendor_product_detail, name='vendor-product-detail'),
    path('admin/products/', views.admin_products, name='admin-products'),
    path('admin/reviews/', views.admin_product_reviews, name='admin-product-reviews'),
    path('admin/categories/', views.admin_categories, name='admin-categories'),
    path('admin/products/bulk-import/', views.admin_products_bulk_import, name='admin-products-bulk-import'),
    path('admin/products/<int:product_id>/', views.admin_product_detail, name='admin-product-detail'),
    path('admin/products/<int:product_id>/generate-barcode/', views.admin_product_generate_barcode, name='admin-product-generate-barcode'),
    path('admin/reviews/<int:review_id>/', views.admin_product_review_detail, name='admin-product-review-detail'),
    path('admin/review-comments/<int:comment_id>/', views.admin_product_review_comment_detail, name='admin-product-review-comment-detail'),
    
    # THE FIX: The route for a single product: http://127.0.0.1:8000/api/products/1/
    path('<str:pk>/', views.get_product, name='product-detail'),
]
