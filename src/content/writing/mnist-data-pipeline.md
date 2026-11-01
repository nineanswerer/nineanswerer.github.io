---
title: "MNIST 数据处理：从样本划分到批量迭代"
description: "整理早期飞桨课程复现笔记，修正测试集读取和生成器返回等笔误，用最小代码讲清训练、验证、测试划分与 mini-batch。"
date: 2026-03-25
updated: 2026-11-01
tags: ["Python", "深度学习", "数据处理"]
---

## 先分清三个数据集的作用

这份笔记整理自[飞桨 MNIST 教程](https://www.paddlepaddle.org.cn/tutorials/projectdetail/5696660)的复现过程，重点只放在数据处理，不包含网络结构和训练代码。

训练集用于更新模型参数，验证集用于训练过程中的模型选择与调参，测试集用于最后评估。三者不能混用；尤其不应通过反复观察测试集结果来调整模型，否则评估会失去独立性。

原笔记使用压缩 JSON 数据，可[下载 mnist.json.gz](/files/mnist.json.gz)。文件约 19 MB，建议放在自己的工作数据目录，而不是重复提交到每个练习项目。

## 读取数据并检查基本约束

使用 `gzip` 解压文本流，再交给 `json` 解析。读取后立即检查图像与标签数量是否一致，比等训练时报错更容易定位问题。

```python
import gzip
import json

DATA_FILE = "./work/mnist.json.gz"

with gzip.open(DATA_FILE, "rt", encoding="utf-8") as file:
    train_set, val_set, test_set = json.load(file)

for name, dataset in (("train", train_set), ("valid", val_set), ("test", test_set)):
    images, labels = dataset
    assert len(images) == len(labels), f"{name} 图像和标签数量不一致"
    print(name, len(images))
```

旧笔记曾把测试集误写成验证集的读取，还留下了多余的赋值。显式使用 `test_set` 和按名称循环，可以避免这类复制粘贴错误。

## 打乱索引，而不是只打乱图像

训练时需要打乱样本顺序，但图像和标签的对应关系必须保持。一个简单方法是生成索引列表，只打乱索引，再通过同一个索引读取图像和标签。

```python
import random

images, labels = train_set
indices = list(range(len(images)))
random.shuffle(indices)

first = indices[0]
assert len(images[first]) > 0
# images[first] 与 labels[first] 仍属于同一个样本
```

验证和测试通常不需要打乱，因为结果应可重复，而且样本顺序不影响逐个评估。若训练代码设置随机种子，也应同时记录数据划分方式，避免把“可复现”误解为只固定一个随机数。

## 用生成器产生 mini-batch

批量迭代不需要一次性把所有批次都复制到内存。生成器可以累积到指定大小后 `yield`，并单独处理最后一个不足批次的样本组。

```python
import numpy as np
import random


def batch_iterator(images, labels, batch_size=100, shuffle=False):
    if len(images) != len(labels):
        raise ValueError("图像和标签数量必须一致")
    if batch_size <= 0:
        raise ValueError("batch_size 必须为正整数")

    indices = list(range(len(images)))
    if shuffle:
        random.shuffle(indices)

    for start in range(0, len(indices), batch_size):
        batch_indices = indices[start:start + batch_size]
        batch_images = np.asarray([images[i] for i in batch_indices], dtype=np.float32)
        batch_labels = np.asarray([labels[i] for i in batch_indices], dtype=np.int64)
        yield batch_images, batch_labels


train_images, train_labels = train_set
first_images, first_labels = next(iter(batch_iterator(
    train_images,
    train_labels,
    batch_size=100,
    shuffle=True,
)))
print(first_images.shape, first_labels.shape)
```

这里不再把生成器函数自身作为返回值返回。调用 `batch_iterator()` 得到可迭代对象，`next(iter(...))` 取出一个批次；最后一个批次可能小于 `batch_size`，调用方应根据任务决定是否保留。

## 机器校验与人工检查缺一不可

数量一致只能说明数据在基本结构上对齐，不能证明图像内容和标签语义正确。还可以检查像素范围、图像维度、标签集合以及每个类别的数量。

人工检查则应抽取少量样本，把图像与标签一起显示。尤其在reshape、归一化或通道转换之后，先看一张图，往往比直接启动完整训练更省时间。

## 什么时候改用 Dataset 与 DataLoader

练习阶段手写生成器有助于理解索引、批量和迭代；进入更完整的训练流程后，框架提供的 `Dataset` 与 `DataLoader` 更适合处理打乱、并行读取和批次组合等通用工作。

无论使用哪种接口，核心约束都不变：图像与标签始终对齐，训练与评估职责分开，输入维度和数值类型经过验证。数据管道可靠之后，模型实验的结果才更容易解释。
