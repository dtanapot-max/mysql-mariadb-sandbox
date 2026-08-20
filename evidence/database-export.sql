CREATE DATABASE IF NOT EXISTS `demo`;
USE `demo`;
CREATE TABLE `users` (`id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(50) NOT NULL, `email` VARCHAR(100) UNIQUE, `age` INT DEFAULT 0);
INSERT INTO `users` (`id`,`name`,`email`,`age`) VALUES (1,'A','a@test',20);
INSERT INTO `users` (`id`,`name`,`email`,`age`) VALUES (2,'B','b@test',15);
