from django.contrib import admin
from .models import Category, Product, ProductImage, ProductSaleOption

class ProductImageInline(admin.TabularInline):
    """
    Allows us to upload multiple images directly from the Product creation page.
    """
    model = ProductImage
    extra = 1 # Shows one empty extra row for uploading


class ProductSaleOptionInline(admin.TabularInline):
    model = ProductSaleOption
    extra = 1
    fields = (
        "label",
        "quantity_value",
        "quantity_unit",
        "base_quantity_equivalent",
        "stock_units_consumed",
        "use_manual_price",
        "manual_price",
        "sort_order",
        "is_default",
        "is_active",
    )


class ProductAdmin(admin.ModelAdmin):
    """
    Configures how the Product model is displayed in the Admin dashboard.
    """
    list_display = ['title', 'barcode', 'vendor', 'category', 'price', 'sale_type', 'base_unit_label', 'stock', 'is_active']
    list_filter = ['is_active', 'category', 'sale_type']
    search_fields = ['title', 'barcode', 'vendor__store_name']
    
    # Automatically fills the slug field as you type the title
    prepopulated_fields = {'slug': ('title',)} 
    
    # Injects the image uploader directly into the product page
    inlines = [ProductImageInline, ProductSaleOptionInline]

class CategoryAdmin(admin.ModelAdmin):
    """
    Configures how the Category model is displayed.
    """
    list_display = ['name', 'parent']
    search_fields = ['name']
    prepopulated_fields = {'slug': ('name',)}

# Register the models
admin.site.register(Category, CategoryAdmin)
admin.site.register(Product, ProductAdmin)
