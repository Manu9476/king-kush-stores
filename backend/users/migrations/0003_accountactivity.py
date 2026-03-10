from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_customuser_customer_id'),
    ]

    operations = [
        migrations.CreateModel(
            name='AccountActivity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('activity_type', models.CharField(choices=[('profile_update', 'Profile Update'), ('order_create', 'Order Created'), ('order_cancel', 'Order Cancelled'), ('address_create', 'Address Added'), ('address_update', 'Address Updated'), ('address_delete', 'Address Deleted'), ('payment_create', 'Payment Method Added'), ('payment_update', 'Payment Method Updated'), ('payment_delete', 'Payment Method Deleted')], max_length=40)),
                ('description', models.CharField(max_length=255)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='account_activities', to='users.customuser')),
            ],
            options={
                'ordering': ('-created_at',),
            },
        ),
    ]
